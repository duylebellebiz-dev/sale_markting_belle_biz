import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
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

interface BusinessSmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPassword: string;
  smtpFromName: string;
  businessName: string;
}

/**
 * Sends through the business's own SMTP mailbox when configured (so emails
 * truly come "from" the business's address — no Resend domain verification
 * needed), otherwise falls back to the shared Resend sender.
 */
@Injectable()
export class EmailService {
  private readonly resend: Resend;
  private readonly defaultFrom: string;
  private readonly logger = new Logger(EmailService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const apiKey = this.config.getOrThrow<string>('RESEND_API_KEY');
    this.defaultFrom = this.config.getOrThrow<string>('EMAIL_FROM');
    this.resend = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: options.businessId },
      select: {
        businessName: true,
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPassword: true,
        smtpFromName: true,
      },
    });

    if (business?.smtpHost && business.smtpUser && business.smtpPassword) {
      return this.sendViaSmtp(options, business);
    }
    return this.sendViaResend(options);
  }

  private async sendViaSmtp(
    options: SendEmailOptions,
    cfg: BusinessSmtpConfig,
  ): Promise<string> {
    const transporter = nodemailer.createTransport({
      host: cfg.smtpHost,
      port: cfg.smtpPort,
      secure: cfg.smtpSecure,
      auth: {
        user: cfg.smtpUser,
        pass: decrypt(cfg.smtpPassword),
      },
    });

    const fromName = cfg.smtpFromName || cfg.businessName;
    try {
      const info = await transporter.sendMail({
        from: `"${fromName}" <${cfg.smtpUser}>`,
        to: options.to,
        cc: options.cc?.length ? options.cc : undefined,
        bcc: options.bcc?.length ? options.bcc : undefined,
        subject: options.subject,
        html: options.html,
        attachments: options.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return info.messageId;
    } catch (err) {
      this.logger.error('SMTP send error', err as Error);
      throw new Error((err as Error).message);
    }
  }

  private async sendViaResend(options: SendEmailOptions): Promise<string> {
    const { data, error } = await this.resend.emails.send({
      from: this.defaultFrom,
      to: Array.isArray(options.to) ? options.to : [options.to],
      cc: options.cc?.length ? options.cc : undefined,
      bcc: options.bcc?.length ? options.bcc : undefined,
      subject: options.subject,
      html: options.html,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
      })),
    });

    if (error) {
      this.logger.error('Resend error', error);
      throw new Error(error.message);
    }

    return data!.id;
  }
}
