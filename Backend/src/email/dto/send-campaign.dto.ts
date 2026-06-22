import { IsISO8601, IsOptional, IsString } from 'class-validator';

/**
 * Received as multipart/form-data so every field arrives as a string.
 * The `segment` field is a JSON-encoded SegmentFilter object.
 * `attachments` come in as Express.Multer.File[] via FilesInterceptor.
 */
export class SendCampaignDto {
  /** ID of an existing EmailTemplate. Omit to supply subject+bodyHtml directly. */
  @IsOptional()
  @IsString()
  templateId?: string;

  /** Overrides or replaces the template subject. */
  @IsOptional()
  @IsString()
  subject?: string;

  /** Overrides or replaces the template body HTML. */
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  /**
   * JSON-encoded SegmentFilter:
   * { salespersonId?, stage?, status?, invoiceOverdueDays? }
   * Omit or send "{}" to target all customers with email in the business.
   */
  @IsOptional()
  @IsString()
  segment?: string;

  /**
   * ISO-8601 datetime. Omit (or null / past date) to send immediately.
   * Future date → campaign is stored as 'scheduled' and dispatched by the cron worker.
   */
  @IsOptional()
  @IsISO8601()
  scheduledAt?: string;

  /** Comma-separated email addresses, applied to every recipient in this send. */
  @IsOptional()
  @IsString()
  cc?: string;

  /** Comma-separated email addresses, applied to every recipient in this send. */
  @IsOptional()
  @IsString()
  bcc?: string;
}

export interface SegmentFilter {
  /** Owner-only: restrict to customers assigned to this salesperson. */
  salespersonId?: string;
  stage?: string;
  status?: string;

  // ── Subscription customers (§11.5) ──────────────────────────────────────
  /** Include only customers who have at least one Active subscription. */
  hasActiveSubscription?: boolean;
  /** Further restrict to subscriptions for a specific service (ID string). */
  subscriptionServiceId?: string;
  /** Further restrict to subscriptions expiring within N calendar days. */
  subscriptionExpiringDays?: number;

  // ── Unpaid-invoice customers (§11.5) ─────────────────────────────────────
  /** Include only customers with ≥1 invoice in status Sent/Overdue and balanceDue > 0. */
  unpaidInvoiceOnly?: boolean;
  /** Narrow to invoices whose dueDate is more than N days in the past. */
  unpaidOverdueDays?: number;

  /** @deprecated Use unpaidInvoiceOnly + unpaidOverdueDays instead. */
  invoiceOverdueDays?: number;
}
