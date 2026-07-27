import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailCampaign, EmailLog, EmailLogStatus, Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';
import { normalizeMessageId } from './mailgun-email.service';

// ---------------------------------------------------------------------------
// 1×1 transparent GIF — returned for every open-pixel request
// ---------------------------------------------------------------------------
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);

// ---------------------------------------------------------------------------
// Status upgrade table
// Only move a log status "forward"; never downgrade (e.g. clicked → opened).
// ---------------------------------------------------------------------------
const STATUS_RANK: Record<string, number> = {
  queued: 0,
  failed: 0,
  sent: 1,
  delivered: 2,
  opened: 3,
  clicked: 4,
  bounced: 5,
  complained: 5,
};

function canUpgrade(current: string, next: string): boolean {
  return (STATUS_RANK[next] ?? 0) > (STATUS_RANK[current] ?? 0);
}

// ---------------------------------------------------------------------------
// Mailgun webhook event payload shape (subset we care about)
// https://documentation.mailgun.com/en/latest/user_manual.html#webhooks
// ---------------------------------------------------------------------------
interface MailgunWebhookPayload {
  signature: {
    timestamp: string;
    token: string;
    signature: string;
  };
  'event-data': {
    event: string;
    message?: {
      headers?: {
        'message-id'?: string;
      };
    };
    [key: string]: unknown;
  };
}

@Injectable()
export class EmailTrackingService {
  private readonly logger = new Logger(EmailTrackingService.name);
  private readonly appUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.appUrl = (config.get<string>('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
    // MAILGUN_WEBHOOK_SIGNING_KEY is optional at startup — verified at request time.
    this.webhookSecret = config.get<string>('MAILGUN_WEBHOOK_SIGNING_KEY') ?? '';
  }

  // ---------------------------------------------------------------------------
  // HTML instrumentation — call AFTER renderTemplate, BEFORE send
  // ---------------------------------------------------------------------------

  /**
   * Rewrites every <a href="..."> link and appends a 1×1 tracking pixel.
   * Safe to call with arbitrary HTML; uses simple regex (no external parser).
   */
  injectTracking(html: string, logId: string): string {
    const rewritten = this.rewriteLinks(html, logId);
    return this.appendPixel(rewritten, logId);
  }

  private rewriteLinks(html: string, logId: string): string {
    // Match href attributes inside anchor tags; skip mailto: / tel: / # anchors
    return html.replace(
      /(<a\b[^>]*?\s)href=(["'])((?:https?:\/\/)[^"']+)\2/gi,
      (_match, prefix, quote, url) => {
        const trackUrl =
          `${this.appUrl}/email/track/click/${logId}` +
          `?url=${encodeURIComponent(url)}`;
        return `${prefix}href=${quote}${trackUrl}${quote}`;
      },
    );
  }

  private appendPixel(html: string, logId: string): string {
    const pixelTag =
      `<img src="${this.appUrl}/email/track/open/${logId}"` +
      ` width="1" height="1" style="display:none" alt="" />`;

    return html.includes('</body>')
      ? html.replace('</body>', `${pixelTag}</body>`)
      : html + pixelTag;
  }

  // ---------------------------------------------------------------------------
  // Tracking pixel — GET /email/track/open/:logId
  // ---------------------------------------------------------------------------
  async recordOpen(logId: string): Promise<Buffer> {
    try {
      const log = await this.prisma.emailLog.findUnique({
        where: { id: logId },
        select: { id: true, status: true, openedAt: true },
      });

      if (log) {
        const data: Prisma.EmailLogUpdateInput = {};
        if (!log.openedAt) data.openedAt = new Date();
        if (canUpgrade(log.status, 'opened')) data.status = EmailLogStatus.opened;
        if (Object.keys(data).length) {
          await this.prisma.emailLog.update({ where: { id: log.id }, data });
        }
      }
    } catch (err) {
      // Never block the GIF response on a DB error
      this.logger.warn(`recordOpen failed for ${logId}: ${(err as Error).message}`);
    }
    return TRANSPARENT_GIF;
  }

  // ---------------------------------------------------------------------------
  // Click redirect — GET /email/track/click/:logId?url=...
  // ---------------------------------------------------------------------------
  async recordClick(logId: string, rawUrl: string | undefined): Promise<string> {
    if (!rawUrl) throw new BadRequestException('url query param is required');

    // Validate the destination URL before redirecting
    let destination: string;
    try {
      const parsed = new URL(rawUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('non-http');
      }
      destination = parsed.toString();
    } catch {
      throw new BadRequestException('Invalid redirect URL');
    }

    try {
      const log = await this.prisma.emailLog.findUnique({
        where: { id: logId },
        select: { id: true, status: true, clickedAt: true },
      });

      if (log) {
        const data: Prisma.EmailLogUpdateInput = {};
        if (!log.clickedAt) data.clickedAt = new Date();
        if (canUpgrade(log.status, 'clicked')) data.status = EmailLogStatus.clicked;
        if (Object.keys(data).length) {
          await this.prisma.emailLog.update({ where: { id: log.id }, data });
        }
      }
    } catch (err) {
      this.logger.warn(`recordClick failed for ${logId}: ${(err as Error).message}`);
    }

    return destination;
  }

  // ---------------------------------------------------------------------------
  // Mailgun webhook — POST /email/webhook/mailgun
  // The signature block travels inside the JSON body itself (not headers).
  // ---------------------------------------------------------------------------
  async handleMailgunWebhook(rawBody: Buffer): Promise<{ received: boolean }> {
    // 1. Parse payload
    let payload: MailgunWebhookPayload;
    try {
      payload = JSON.parse(rawBody.toString('utf-8')) as MailgunWebhookPayload;
    } catch {
      throw new BadRequestException('Invalid JSON in webhook body');
    }

    // 2. Verify Mailgun's HMAC signature
    if (this.webhookSecret) {
      this.verifyMailgunSignature(payload.signature);
    } else {
      this.logger.warn('MAILGUN_WEBHOOK_SIGNING_KEY not set — skipping signature check');
    }

    // 3. Apply the event
    const eventData = payload['event-data'];
    const messageId = eventData?.message?.headers?.['message-id'];
    if (!eventData?.event || !messageId) return { received: true }; // unknown format — ignore silently

    await this.applyWebhookEvent(eventData.event, normalizeMessageId(messageId));

    return { received: true };
  }

  private async applyWebhookEvent(type: string, emailId: string): Promise<void> {
    switch (type) {
      case 'delivered':
        // Only upgrade sent → delivered (don't downgrade opened/clicked)
        await this.prisma.emailLog.updateMany({
          where: { providerMessageId: emailId, status: EmailLogStatus.sent },
          data: { status: EmailLogStatus.delivered },
        });
        return;

      case 'failed':
        await this.prisma.emailLog.updateMany({
          where: { providerMessageId: emailId },
          data: { status: EmailLogStatus.bounced, bouncedAt: new Date() },
        });
        return;

      case 'complained':
        await this.prisma.emailLog.updateMany({
          where: { providerMessageId: emailId },
          data: { status: EmailLogStatus.complained },
        });
        return;

      case 'opened':
        // Mailgun can also fire open events; treat same as our pixel
        await this.prisma.emailLog.updateMany({
          where: {
            providerMessageId: emailId,
            status: { in: [EmailLogStatus.sent, EmailLogStatus.delivered] },
          },
          data: { status: EmailLogStatus.opened, openedAt: new Date() },
        });
        return;

      case 'clicked':
        await this.prisma.emailLog.updateMany({
          where: {
            providerMessageId: emailId,
            status: {
              in: [
                EmailLogStatus.sent,
                EmailLogStatus.delivered,
                EmailLogStatus.opened,
              ],
            },
          },
          data: { status: EmailLogStatus.clicked, clickedAt: new Date() },
        });
        return;

      default:
        this.logger.debug(`Unhandled webhook type: ${type}`);
        return;
    }
  }

  /**
   * Verifies Mailgun's webhook HMAC signature (timestamp + token, signed with the
   * account's HTTP webhook signing key). Throws UnauthorizedException if invalid
   * or the timestamp is stale.
   */
  private verifyMailgunSignature(signature: MailgunWebhookPayload['signature']): void {
    const { timestamp, token, signature: providedSignature } = signature ?? {};
    if (!timestamp || !token || !providedSignature) {
      throw new UnauthorizedException('Missing Mailgun signature fields');
    }

    // Reject requests older than 5 minutes
    const now = Math.floor(Date.now() / 1000);
    const ts = parseInt(timestamp, 10);
    if (isNaN(ts) || Math.abs(now - ts) > 300) {
      throw new UnauthorizedException('Webhook timestamp out of range');
    }

    const expected = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}${token}`)
      .digest('hex');

    const valid =
      expected.length === providedSignature.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(providedSignature));
    if (!valid) throw new UnauthorizedException('Invalid webhook signature');
  }

  // ---------------------------------------------------------------------------
  // GET /email/history/:customerId
  // ---------------------------------------------------------------------------
  async getCustomerHistory(
    user: RequestUser,
    customerId: string,
  ): Promise<EmailLog[]> {
    const canViewAll =
      user.role === 'owner' || user.permissions?.viewAllCustomers === true;
    const customer = await this.prisma.customer.findFirst({
      where: {
        id: customerId,
        businessId: user.businessId,
        ...(canViewAll ? {} : { assignedToId: user.userId }),
      },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.emailLog.findMany({
      where: { businessId: user.businessId, customerId },
      include: {
        campaign: {
          select: {
            subject: true,
            templateId: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // GET /email/campaigns/:id/stats
  // ---------------------------------------------------------------------------
  async getCampaignStats(
    businessId: string,
    campaignId: string,
  ): Promise<CampaignStats> {
    const campaign = await this.prisma.emailCampaign.findFirst({
      where: { id: campaignId, businessId },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const counts = await this.countLogs({ campaignId });
    return buildStats(campaign, counts);
  }

  // ---------------------------------------------------------------------------
  // Per-template aggregate (all campaigns that used this template)
  // ---------------------------------------------------------------------------
  async getTemplateStats(
    businessId: string,
    templateId: string,
  ): Promise<TemplateStats> {
    const counts = await this.countLogs({
      businessId,
      campaign: { is: { templateId } },
    });

    const base = counts.sent || 1;
    return {
      templateId,
      totalRecipients: counts.total,
      sentCount: counts.sent,
      openRate: round(counts.opened / base),
      clickRate: round(counts.clicked / base),
      bounceRate: round(counts.bounced / base),
      complaintRate: round(counts.complained / base),
    };
  }

  // Aggregate EmailLog counts for a given where filter.
  private async countLogs(where: Prisma.EmailLogWhereInput): Promise<RawAgg> {
    const [total, sent, delivered, opened, clicked, bounced, complained, failed] =
      await Promise.all([
        this.prisma.emailLog.count({ where }),
        this.prisma.emailLog.count({ where: { ...where, sentAt: { not: null } } }),
        this.prisma.emailLog.count({
          where: {
            ...where,
            status: {
              in: [
                EmailLogStatus.delivered,
                EmailLogStatus.opened,
                EmailLogStatus.clicked,
              ],
            },
          },
        }),
        this.prisma.emailLog.count({ where: { ...where, openedAt: { not: null } } }),
        this.prisma.emailLog.count({ where: { ...where, clickedAt: { not: null } } }),
        this.prisma.emailLog.count({
          where: { ...where, status: EmailLogStatus.bounced },
        }),
        this.prisma.emailLog.count({
          where: { ...where, status: EmailLogStatus.complained },
        }),
        this.prisma.emailLog.count({
          where: { ...where, status: EmailLogStatus.failed },
        }),
      ]);
    return { total, sent, delivered, opened, clicked, bounced, complained, failed };
  }
}

// ---------------------------------------------------------------------------
// Local helpers / types
// ---------------------------------------------------------------------------

interface RawAgg {
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
}

function round(n: number): number {
  return Math.round(n * 10_000) / 100; // percentage, 2 decimal places
}

function buildStats(campaign: EmailCampaign, c: RawAgg): CampaignStats {
  const base = c.sent || 1;
  return {
    campaignId: campaign.id,
    subject: campaign.subject,
    status: campaign.status,
    scheduledAt: campaign.scheduledAt,
    totalRecipients: c.total,
    sentCount: c.sent,
    deliveredCount: c.delivered,
    failedCount: c.failed,
    openRate: round(c.opened / base),
    clickRate: round(c.clicked / base),
    bounceRate: round(c.bounced / base),
    complaintRate: round(c.complained / base),
  };
}

export interface CampaignStats {
  campaignId: string;
  subject: string;
  status: string;
  scheduledAt: Date | null;
  totalRecipients: number;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
  /** percentage 0-100 */
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}

export interface TemplateStats {
  templateId: string;
  totalRecipients: number;
  sentCount: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  complaintRate: number;
}
