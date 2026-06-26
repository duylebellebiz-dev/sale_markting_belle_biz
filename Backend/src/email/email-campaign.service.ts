import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CampaignStatus,
  EmailCampaign,
  EmailLogStatus,
  InvoiceStatus,
  PipelineStage,
  Prisma,
  SubscriptionStatus,
} from '@prisma/client';
import * as fs from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTemplateService } from './email-template.service';
import { ResendEmailService } from './resend-email.service';
import { EmailTrackingService } from './email-tracking.service';
import { SendCampaignDto, SegmentFilter } from './dto/send-campaign.dto';
import type { RequestUser } from '../common/decorators/current-user.decorator';

const DAILY_CAP = 100;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parses a comma-separated email list, trimming and validating each address. */
function parseEmailList(raw: string | undefined, label: string): string[] {
  if (!raw) return [];
  const emails = raw
    .split(',')
    .map((e) => e.trim())
    .filter((e) => e.length > 0);
  const invalid = emails.filter((e) => !EMAIL_RE.test(e));
  if (invalid.length) {
    throw new BadRequestException(
      `${label} contains invalid email address(es): ${invalid.join(', ')}`,
    );
  }
  return emails;
}

const SENT_STATUSES: EmailLogStatus[] = [
  EmailLogStatus.sent,
  EmailLogStatus.delivered,
  EmailLogStatus.opened,
  EmailLogStatus.clicked,
  EmailLogStatus.bounced,
  EmailLogStatus.complained,
];

interface CampaignAttachment {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
}

@Injectable()
export class EmailCampaignService {
  private readonly logger = new Logger(EmailCampaignService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly emailService: ResendEmailService,
    private readonly emailTrackingService: EmailTrackingService,
  ) {}

  // ---------------------------------------------------------------------------
  // POST /email/send — public entry point
  // ---------------------------------------------------------------------------
  async send(
    user: RequestUser,
    dto: SendCampaignDto,
    files: Express.Multer.File[],
  ): Promise<{ data: object; message: string }> {
    // 1. Resolve subject + bodyHtml
    let subject: string;
    let bodyHtml: string;
    let templateId: string | undefined;

    if (dto.templateId) {
      const tmpl = await this.emailTemplateService.findOne(
        user.businessId,
        dto.templateId,
      );
      subject = dto.subject ?? tmpl.subject;
      bodyHtml = dto.bodyHtml ?? tmpl.bodyHtml;
      templateId = tmpl.id;
    } else {
      if (!dto.subject || !dto.bodyHtml) {
        throw new BadRequestException(
          'subject and bodyHtml are required when no templateId is provided',
        );
      }
      subject = dto.subject;
      bodyHtml = dto.bodyHtml;
    }

    // 2. Parse segment
    let segment: SegmentFilter = {};
    if (dto.segment) {
      try {
        segment = JSON.parse(dto.segment) as SegmentFilter;
      } catch {
        throw new BadRequestException('segment must be valid JSON');
      }
    }

    // 3. Find recipients (customers with email addresses in scope)
    const customerWhere = await this.buildSegmentQuery(
      user.businessId,
      user.userId,
      user.role,
      segment,
    );
    const customers = await this.prisma.customer.findMany({
      where: customerWhere,
    });
    const recipients = customers.filter((c) => c.email);

    if (!recipients.length) {
      throw new BadRequestException(
        'No customers with email addresses match the segment',
      );
    }

    // 3b. Parse CC/BCC (applied to every recipient in this send)
    const cc = parseEmailList(dto.cc, 'cc');
    const bcc = parseEmailList(dto.bcc, 'bcc');

    // 4. Attachment metadata (files already saved to disk by multer)
    const attachments: CampaignAttachment[] = files.map((f) => ({
      filename: f.originalname,
      path: f.path,
      mimeType: f.mimetype,
      size: f.size,
    }));

    // 5. Determine if scheduled for the future
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const isFuture = scheduledAt && scheduledAt > new Date();

    // 6. Create campaign record
    const campaign = await this.prisma.emailCampaign.create({
      data: {
        businessId: user.businessId,
        createdById: user.userId,
        templateId: templateId ?? null,
        subject,
        bodyHtml,
        attachments: attachments as unknown as Prisma.InputJsonValue,
        segment: segment as unknown as Prisma.InputJsonValue,
        cc,
        bcc,
        scheduledAt,
        status: isFuture ? CampaignStatus.scheduled : CampaignStatus.sending,
        sentCount: 0,
      },
    });

    // 7. Create one queued EmailLog per recipient
    await this.prisma.emailLog.createMany({
      data: recipients.map((c) => ({
        businessId: user.businessId,
        campaignId: campaign.id,
        customerId: c.id,
        to: c.email,
        subject,
        status: EmailLogStatus.queued,
      })),
    });
    const recipientCount = recipients.length;

    // 8. Scheduled → return immediately; cron will dispatch
    if (isFuture) {
      return {
        data: { campaignId: campaign.id, scheduledAt, recipientCount },
        message: `Campaign scheduled for ${scheduledAt!.toISOString()} — ${recipientCount} recipient(s) queued`,
      };
    }

    // 9. Send now, respecting the daily cap
    const { sent, deferred } = await this.dispatchCampaign(campaign.id);

    const finalStatus =
      deferred > 0 ? CampaignStatus.partially_sent : CampaignStatus.sent;
    await this.prisma.emailCampaign.update({
      where: { id: campaign.id },
      data: { status: finalStatus, sentCount: sent },
    });

    const message =
      deferred > 0
        ? `Sent ${sent} email(s). ${deferred} deferred to tomorrow (daily cap of ${DAILY_CAP} reached).`
        : `Sent ${sent} email(s) successfully.`;

    return { data: { campaignId: campaign.id, sent, deferred }, message };
  }

  // ---------------------------------------------------------------------------
  // Called by the reminders cron worker on every tick
  // ---------------------------------------------------------------------------
  async dispatchScheduled(): Promise<void> {
    const now = new Date();
    const dueCampaigns = await this.prisma.emailCampaign.findMany({
      where: {
        status: {
          in: [CampaignStatus.scheduled, CampaignStatus.partially_sent],
        },
        scheduledAt: { lte: now },
      },
    });

    if (!dueCampaigns.length) return;

    this.logger.log(`dispatchScheduled — ${dueCampaigns.length} campaign(s) due`);

    for (const campaign of dueCampaigns) {
      const queuedCount = await this.prisma.emailLog.count({
        where: { campaignId: campaign.id, status: EmailLogStatus.queued },
      });

      if (!queuedCount) {
        await this.prisma.emailCampaign.update({
          where: { id: campaign.id },
          data: { status: CampaignStatus.sent },
        });
        continue;
      }

      const { sent, deferred } = await this.dispatchCampaign(campaign.id);

      const newStatus =
        deferred > 0 ? CampaignStatus.partially_sent : CampaignStatus.sent;
      await this.prisma.emailCampaign.update({
        where: { id: campaign.id },
        data: { status: newStatus, sentCount: { increment: sent } },
      });

      this.logger.log(
        `dispatchScheduled — campaign ${campaign.id}: sent ${sent}, deferred ${deferred}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // GET /email/campaigns
  // ---------------------------------------------------------------------------
  listCampaigns(businessId: string): Promise<EmailCampaign[]> {
    return this.prisma.emailCampaign.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Core dispatch: sends up to (daily cap remaining) queued logs, defers the rest
  // ---------------------------------------------------------------------------
  private async dispatchCampaign(
    campaignId: string,
  ): Promise<{ sent: number; deferred: number }> {
    const campaign = await this.prisma.emailCampaign.findUnique({
      where: { id: campaignId },
    });
    if (!campaign) return { sent: 0, deferred: 0 };

    const queuedLogs = await this.prisma.emailLog.findMany({
      where: { campaignId, status: EmailLogStatus.queued },
      include: {
        customer: { include: { assignedTo: { select: { fullName: true } } } },
      },
    });
    if (!queuedLogs.length) return { sent: 0, deferred: 0 };

    const remaining = await this.getRemainingDailyCap(campaign.businessId);
    if (remaining <= 0) {
      return { sent: 0, deferred: queuedLogs.length };
    }

    const toSend = queuedLogs.slice(0, remaining);
    const deferred = queuedLogs.length - toSend.length;

    // Read attachment files from disk once
    const attachments =
      (campaign.attachments as unknown as CampaignAttachment[]) ?? [];
    const attachmentBuffers = attachments
      .filter((a) => fs.existsSync(a.path))
      .map((a) => ({
        filename: a.filename,
        content: fs.readFileSync(a.path),
        contentType: a.mimeType,
      }));

    let sent = 0;
    for (const log of toSend) {
      const customer = log.customer;
      const salesperson = customer?.assignedTo?.fullName ?? '';

      const context = {
        customer_name: customer?.customerName ?? '',
        shop_name: customer?.shopName ?? '',
        salesperson_name: salesperson,
        // invoice_amount, service_name, expiry_date are not available at bulk-send
        // time so they render as empty strings.
      };

      // 1. Personalise variables
      const renderedHtml = this.emailTemplateService.renderTemplate(
        campaign.bodyHtml,
        context,
      );

      // 2. Rewrite links + inject open-pixel (uses the log's own id)
      const trackedHtml = this.emailTrackingService.injectTracking(
        renderedHtml,
        log.id,
      );

      try {
        const msgId = await this.emailService.send({
          businessId: campaign.businessId,
          to: log.to,
          cc: campaign.cc,
          bcc: campaign.bcc,
          subject: campaign.subject,
          html: trackedHtml,
          attachments: attachmentBuffers,
        });
        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: {
            status: EmailLogStatus.sent,
            sentAt: new Date(),
            providerMessageId: msgId,
          },
        });
        sent++;
      } catch (err) {
        this.logger.warn(
          `Failed to send to ${log.to}: ${(err as Error).message}`,
        );
        await this.prisma.emailLog.update({
          where: { id: log.id },
          data: { status: EmailLogStatus.failed },
        });
      }
    }

    return { sent, deferred };
  }

  // ---------------------------------------------------------------------------
  // Public: return the count of customers matching a segment (for the UI preview)
  // ---------------------------------------------------------------------------
  async countSegment(
    businessId: string,
    userId: string,
    role: 'owner' | 'salesperson',
    segment: SegmentFilter,
  ): Promise<number> {
    const where = await this.buildSegmentQuery(
      businessId,
      userId,
      role,
      segment,
    );
    return this.prisma.customer.count({ where });
  }

  // ---------------------------------------------------------------------------
  // Builds a Customer query filter from a SegmentFilter, respecting role scope
  // ---------------------------------------------------------------------------
  private async buildSegmentQuery(
    businessId: string,
    userId: string,
    role: 'owner' | 'salesperson',
    segment: SegmentFilter,
  ): Promise<Prisma.CustomerWhereInput> {
    const where: Prisma.CustomerWhereInput = {
      businessId,
      email: { not: '' },
    };

    // Role scoping — salesperson can only email their own customers
    if (role === 'salesperson') {
      where.assignedToId = userId;
    } else if (segment.salespersonId) {
      where.assignedToId = segment.salespersonId;
    }

    if (segment.stage) where.stage = segment.stage as PipelineStage;
    if (segment.status) where.status = segment.status;

    const idFilters: string[][] = [];

    // ── Subscription segment ─────────────────────────────────────────────────
    const wantsSubscriptionSegment =
      segment.hasActiveSubscription ||
      segment.subscriptionServiceId != null ||
      segment.subscriptionExpiringDays != null;

    if (wantsSubscriptionSegment) {
      const subWhere: Prisma.SubscriptionWhereInput = {
        businessId,
        status: SubscriptionStatus.Active,
      };
      if (segment.subscriptionServiceId) {
        subWhere.serviceId = segment.subscriptionServiceId;
      }
      if (segment.subscriptionExpiringDays != null) {
        const ceiling = new Date();
        ceiling.setDate(ceiling.getDate() + segment.subscriptionExpiringDays);
        subWhere.expiryDate = { lte: ceiling };
      }
      const subs = await this.prisma.subscription.findMany({
        where: subWhere,
        select: { customerId: true },
      });
      idFilters.push(subs.map((s) => s.customerId));
    }

    // ── Unpaid-invoice segment ───────────────────────────────────────────────
    const wantsUnpaidSegment =
      segment.unpaidInvoiceOnly ||
      segment.unpaidOverdueDays != null ||
      segment.invoiceOverdueDays != null; // legacy field

    if (wantsUnpaidSegment) {
      const invWhere: Prisma.InvoiceWhereInput = {
        businessId,
        status: { in: [InvoiceStatus.Sent, InvoiceStatus.Overdue] },
        balanceDue: { gt: 0 },
      };
      const overdueDays =
        segment.unpaidOverdueDays ?? segment.invoiceOverdueDays;
      if (overdueDays != null) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - overdueDays);
        invWhere.dueDate = { lte: cutoff };
      }
      const unpaidInvoices = await this.prisma.invoice.findMany({
        where: invWhere,
        select: { customerId: true },
      });
      idFilters.push(unpaidInvoices.map((inv) => inv.customerId));
    }

    // Intersect the id-restricted sets (and themselves) into the where clause
    if (idFilters.length) {
      const intersection = idFilters.reduce((acc, ids) => {
        const set = new Set(ids);
        return acc.filter((id) => set.has(id));
      });
      where.id = { in: intersection };
    }

    return where;
  }

  // ---------------------------------------------------------------------------
  // How many emails can still be sent today under the free-tier cap
  // Public so the controller can expose it to the frontend for the quota warning.
  // ---------------------------------------------------------------------------
  async getRemainingDailyCap(businessId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sentToday = await this.prisma.emailLog.count({
      where: {
        businessId,
        sentAt: { gte: startOfDay },
        status: { in: SENT_STATUSES },
      },
    });

    return Math.max(0, DAILY_CAP - sentToday);
  }
}
