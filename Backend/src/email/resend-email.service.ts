import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
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

/**
 * The ONLY service in the app allowed to call Resend. Every outbound email —
 * transactional, invoice, reminder, follow-up, renewal, campaign — goes through
 * here. Two-way 1:1 replies go through GmailService instead (see §11.12).
 *
 * Each business may register its OWN Resend account (own API key + verified
 * sender domain) so its quota and "from" address are independent of other
 * businesses on the platform. If a business hasn't configured one, sends fall
 * back to the shared operator account in .env (RESEND_API_KEY/RESEND_FROM_EMAIL).
 */
@Injectable()
export class ResendEmailService {
  private readonly sharedResend: Resend | null;
  private readonly sharedFromEmail: string;
  private readonly fallbackReplyTo: string;
  private readonly logger = new Logger(ResendEmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim() ?? '';
    this.sharedFromEmail = this.config.get<string>('RESEND_FROM_EMAIL')?.trim() ?? '';
    this.fallbackReplyTo = this.config.get<string>('RESEND_REPLY_TO_EMAIL')?.trim() ?? '';

    this.sharedResend = apiKey ? new Resend(apiKey) : null;

    if (!this.sharedResend || !this.sharedFromEmail) {
      this.logger.warn(
        'RESEND_API_KEY / RESEND_FROM_EMAIL is not configured. Businesses without their own ' +
          'Resend settings will be unable to send email.',
      );
    }
  }

  /** Sends an email via Resend. Throws on failure — callers are responsible for logging EmailLog/EmailMessage status. */
  async send(options: SendEmailOptions): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: options.businessId },
      select: {
        email: true,
        resendApiKey: true,
        resendFromEmail: true,
        resendFromName: true,
        gmailConnection: { select: { emailAddress: true, status: true } },
      },
    });

    const ownApiKey = business?.resendApiKey ? decrypt(business.resendApiKey) : '';
    const resend = ownApiKey ? new Resend(ownApiKey) : this.sharedResend;
    const fromName = business?.resendFromName ? `${business.resendFromName} ` : '';
    const fromEmail = business?.resendFromEmail || this.sharedFromEmail;

    if (!resend || !fromEmail) {
      const message =
        'Resend is not configured for this business. Set it in Settings → Email, or configure ' +
        'RESEND_API_KEY / RESEND_FROM_EMAIL as a platform-wide fallback.';
      this.logger.error(message);
      throw new Error(message);
    }

    const replyTo = this.resolveReplyTo(business);

    const { data, error } = await resend.emails.send({
      from: `${fromName}<${fromEmail}>`,
      to: Array.isArray(options.to) ? options.to : [options.to],
      cc: options.cc?.length ? options.cc : undefined,
      bcc: options.bcc?.length ? options.bcc : undefined,
      replyTo: replyTo || undefined,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      this.logger.error(`Resend send failed: ${error.message}`);
      throw new Error(error.message);
    }

    return data!.id;
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
