import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateReminderScheduleDto } from './dto/update-reminder-schedule.dto';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { UpdateMailgunSettingsDto } from './dto/update-mailgun-settings.dto';
import { UpdateSavedEmailsDto } from './dto/update-saved-emails.dto';
import { encrypt, decrypt } from '../common/crypto';

// Reusable select that strips the password hash from every Business response
const BRANDING_SELECT = {
  id: true,
  businessName: true,
  email: true,
  logoUrl: true,
  addressLine: true,
  country: true,
  phone: true,
  website: true,
  gstNumber: true,
  pstNumber: true,
  defaultTaxRate: true,
  province: true,
  defaultCustomerNote: true,
  defaultTerms: true,
  invoiceNumberPrefix: true,
  invoiceNumberPadding: true,
  invoiceNumberCurrentValue: true,
  createdAt: true,
  updatedAt: true,
} as const;

interface ReminderSchedule {
  invoiceReminderDays: number[];
  renewalReminderDays: number[];
}

function formatInvoiceNumber(prefix: string, value: number, padding: number) {
  return `${prefix}${String(Math.max(value, 0)).padStart(Math.max(padding, 1), '0')}`;
}

function parseInvoiceNumberSeed(raw?: string) {
  const value = raw?.trim();
  if (!value) return null;
  const match = value.match(/^(.*?)(\d+)$/);
  if (!match) {
    throw new UnprocessableEntityException(
      'Current invoice number must end with digits, for example HR0002345.',
    );
  }
  return {
    prefix: match[1],
    padding: match[2].length,
    currentValue: parseInt(match[2], 10),
  };
}

@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapBranding<T extends Record<string, unknown>>(business: T) {
    const currentValue = Number(business.invoiceNumberCurrentValue ?? 0);
    const prefix = String(business.invoiceNumberPrefix ?? 'INV-');
    const padding = Number(business.invoiceNumberPadding ?? 3);
    const currentInvoiceNumber =
      currentValue > 0 ? formatInvoiceNumber(prefix, currentValue, padding) : '';

    const {
      invoiceNumberPrefix: _prefix,
      invoiceNumberPadding: _padding,
      invoiceNumberCurrentValue: _current,
      ...rest
    } = business;

    return {
      ...rest,
      currentInvoiceNumber,
    };
  }

  async getMyBusiness(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { ...BRANDING_SELECT, reminderSchedule: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return this.mapBranding(business);
  }

  async getReminderSchedule(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { reminderSchedule: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business.reminderSchedule;
  }

  async updateReminderSchedule(businessId: string, dto: UpdateReminderScheduleDto) {
    // reminderSchedule is a Json column — read current value and merge
    const existing = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { reminderSchedule: true },
    });
    if (!existing) throw new NotFoundException('Business not found');

    const current = existing.reminderSchedule as unknown as ReminderSchedule;
    const merged: ReminderSchedule = {
      invoiceReminderDays: dto.invoiceReminderDays ?? current.invoiceReminderDays,
      renewalReminderDays: dto.renewalReminderDays ?? current.renewalReminderDays,
    };

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { reminderSchedule: merged as unknown as object },
      select: { reminderSchedule: true },
    });
    return business.reminderSchedule;
  }

  async getBranding(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: BRANDING_SELECT,
    });
    if (!business) throw new NotFoundException('Business not found');
    return this.mapBranding(business);
  }

  async updateBranding(businessId: string, dto: UpdateBrandingDto) {
    // Build patch from only defined fields
    const data: Record<string, unknown> = {};
    const fields = [
      'businessName', 'addressLine', 'country', 'phone', 'website',
      'gstNumber', 'pstNumber', 'defaultTaxRate', 'defaultCustomerNote',
      'defaultTerms', 'province',
    ] as const;
    for (const field of fields) {
      if (dto[field] !== undefined) data[field] = dto[field];
    }

    const invoiceSeed = parseInvoiceNumberSeed(dto.currentInvoiceNumber);
    if (invoiceSeed) {
      data.invoiceNumberPrefix = invoiceSeed.prefix;
      data.invoiceNumberPadding = invoiceSeed.padding;
      data.invoiceNumberCurrentValue = invoiceSeed.currentValue;
    }

    const business = await this.prisma.business.update({
      where: { id: businessId },
      data,
      select: BRANDING_SELECT,
    });
    return this.mapBranding(business);
  }

  // ── Claude API key (§12c.1) ──────────────────────────────────────────────────

  async setClaudeApiKey(businessId: string, plainKey: string): Promise<void> {
    let encrypted: string;
    try {
      encrypted = encrypt(plainKey);
    } catch {
      throw new UnprocessableEntityException(
        'Encryption is misconfigured on the server. Ensure CLAUDE_API_ENCRYPTION_SECRET is set.',
      );
    }
    await this.prisma.business.update({
      where: { id: businessId },
      data: { claudeApiKey: encrypted },
    });
  }

  /** Returns the decrypted key for server-side API calls. Never send to frontend. */
  async getDecryptedClaudeApiKey(businessId: string): Promise<string> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { claudeApiKey: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return decrypt(business.claudeApiKey ?? '');
  }

  /** Returns whether a Claude API key has been configured (no plaintext). */
  async getClaudeKeyStatus(businessId: string): Promise<{ configured: boolean }> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { claudeApiKey: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return { configured: !!business.claudeApiKey };
  }


  // ── Per-business Mailgun settings ────────────────────────────────────────────
  // Each business registers its OWN Mailgun account (own quota, own sending domain)
  // instead of sharing the operator's MAILGUN_API_KEY / MAILGUN_DOMAIN / MAILGUN_FROM_EMAIL.

  /** Returns whether a business-owned Mailgun key is configured, plus the public sender fields. */
  async getMailgunSettings(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: {
        mailgunApiKey: true,
        mailgunDomain: true,
        mailgunFromEmail: true,
        mailgunFromName: true,
      },
    });
    if (!business) throw new NotFoundException('Business not found');
    return {
      configured: !!business.mailgunApiKey,
      domain: business.mailgunDomain,
      fromEmail: business.mailgunFromEmail,
      fromName: business.mailgunFromName,
    };
  }

  async setMailgunSettings(businessId: string, dto: UpdateMailgunSettingsDto) {
    let encryptedKey: string;
    try {
      encryptedKey = encrypt(dto.apiKey);
    } catch {
      throw new UnprocessableEntityException(
        'Encryption is misconfigured on the server. Ensure CLAUDE_API_ENCRYPTION_SECRET is set.',
      );
    }
    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        mailgunApiKey: encryptedKey,
        mailgunDomain: dto.domain,
        mailgunFromEmail: dto.fromEmail,
        mailgunFromName: dto.fromName ?? '',
      },
    });
    return this.getMailgunSettings(businessId);
  }

  /** Clears the business's own Mailgun config so sends fall back to the shared operator account. */
  async clearMailgunSettings(businessId: string) {
    await this.prisma.business.update({
      where: { id: businessId },
      data: { mailgunApiKey: '', mailgunDomain: '', mailgunFromEmail: '', mailgunFromName: '' },
    });
    return this.getMailgunSettings(businessId);
  }

  // ── Saved CC/BCC quick-pick emails ──────────────────────────────────────────
  // A short list of frequently-used addresses (accounting, manager, ...) so staff
  // can add them to an outbound email with one click instead of retyping.

  async getSavedEmails(businessId: string): Promise<string[]> {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { savedCcBccEmails: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return (business.savedCcBccEmails as unknown as string[]) ?? [];
  }

  async updateSavedEmails(businessId: string, dto: UpdateSavedEmailsDto): Promise<string[]> {
    const deduped = Array.from(new Set(dto.emails.map((e) => e.trim().toLowerCase()))).filter(Boolean);
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { savedCcBccEmails: deduped as unknown as object },
      select: { savedCcBccEmails: true },
    });
    return (business.savedCcBccEmails as unknown as string[]) ?? [];
  }

  async updateLogo(businessId: string, logoUrl: string) {
    const business = await this.prisma.business.update({
      where: { id: businessId },
      data: { logoUrl },
      select: BRANDING_SELECT,
    });
    return this.mapBranding(business);
  }
}
