import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Mailgun from 'mailgun.js';
import FormData from 'form-data';
import { PrismaService } from '../prisma/prisma.service';
import { decrypt } from '../common/crypto';

export interface SendEmailOptions {
  businessId: string;
  to: string | string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}

const mailgunClientFactory = new Mailgun(FormData);

/**
 * The ONLY service in the app allowed to call Mailgun. Every outbound email —
 * transactional, invoice, reminder, follow-up, renewal, campaign — goes through
 * here. Two-way 1:1 replies go through GmailService instead (see §11.12).
 *
 * Each business may register its OWN Mailgun account (own API key + sending
 * domain) so its quota and "from" address are independent of other businesses
 * on the platform. If a business hasn't configured one, sends fall back to the
 * shared operator account in .env (MAILGUN_API_KEY/MAILGUN_DOMAIN/MAILGUN_FROM_EMAIL).
 */
@Injectable()
export class MailgunEmailService {
  private readonly apiBaseUrl: string;
  private readonly sharedApiKey: string;
  private readonly sharedDomain: string;
  private readonly sharedFromEmail: string;
  private readonly fallbackReplyTo: string;
  private readonly logger = new Logger(MailgunEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // Mailgun has separate US/EU API regions; default to US.
    this.apiBaseUrl =
      this.config.get<string>('MAILGUN_API_BASE_URL')?.trim() || 'https://api.mailgun.net';
    this.sharedApiKey = this.config.get<string>('MAILGUN_API_KEY')?.trim() ?? '';
    this.sharedDomain = this.config.get<string>('MAILGUN_DOMAIN')?.trim() ?? '';
    this.sharedFromEmail = this.config.get<string>('MAILGUN_FROM_EMAIL')?.trim() ?? '';
    this.fallbackReplyTo = this.config.get<string>('MAILGUN_REPLY_TO_EMAIL')?.trim() ?? '';

    if (!this.sharedApiKey || !this.sharedDomain || !this.sharedFromEmail) {
      this.logger.warn(
        'MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM_EMAIL is not fully configured. ' +
          'Businesses without their own Mailgun settings will be unable to send email.',
      );
    }
  }

  /** Sends an email via Mailgun. Throws on failure — callers are responsible for logging EmailLog/EmailMessage status. */
  async send(options: SendEmailOptions): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: options.businessId },
      select: {
        email: true,
        mailgunApiKey: true,
        mailgunDomain: true,
        mailgunFromEmail: true,
        mailgunFromName: true,
        gmailConnection: { select: { emailAddress: true, status: true } },
      },
    });

    const ownApiKey = business?.mailgunApiKey ? decrypt(business.mailgunApiKey) : '';
    const apiKey = ownApiKey || this.sharedApiKey;
    const domain = business?.mailgunDomain || this.sharedDomain;
    const fromName = business?.mailgunFromName ? `${business.mailgunFromName} ` : '';
    const fromEmail = business?.mailgunFromEmail || this.sharedFromEmail;

    if (!apiKey || !domain || !fromEmail) {
      const message =
        'Mailgun is not configured for this business. Set it in Settings → Email, or configure ' +
        'MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM_EMAIL as a platform-wide fallback.';
      this.logger.error(message);
      throw new Error(message);
    }

    const replyTo = this.resolveReplyTo(business);
    const mg = mailgunClientFactory.client({ username: 'api', key: apiKey, url: this.apiBaseUrl });

    try {
      const result = await mg.messages.create(domain, {
        from: `${fromName}<${fromEmail}>`,
        to: Array.isArray(options.to) ? options.to : [options.to],
        cc: options.cc?.length ? options.cc : undefined,
        bcc: options.bcc?.length ? options.bcc : undefined,
        'h:Reply-To': replyTo || undefined,
        subject: options.subject,
        html: options.html,
        attachment: options.attachments?.map((a) => ({
          filename: a.filename,
          data: a.content,
        })),
      });

      return normalizeMessageId(result.id ?? '');
    } catch (err) {
      const message = (err as Error).message ?? 'Unknown Mailgun error';
      this.logger.error(`Mailgun send failed: ${message}`);
      throw new Error(message);
    }
  }

  /**
   * Reply-To resolution (§11.12 / Part 1): the connected Gmail address takes
   * priority so customer replies land in the two-way conversation inbox.
   * Falls back to the business's own contact email, then the global default.
   */
  private resolveReplyTo(business: {
    email: string;
    gmailConnection: { emailAddress: string; status: string } | null;
  } | null): string {
    if (business?.gmailConnection && business.gmailConnection.status === 'connected') {
      return business.gmailConnection.emailAddress;
    }
    return business?.email || this.fallbackReplyTo;
  }
}

/** Mailgun message ids come back wrapped in angle brackets; strip them for consistent storage/lookup. */
export function normalizeMessageId(id: string): string {
  return id.replace(/^</, '').replace(/>$/, '');
}
