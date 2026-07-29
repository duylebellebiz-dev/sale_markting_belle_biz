import { ArrayNotEmpty, IsArray, IsOptional, IsString } from 'class-validator';

export class BulkSendInvoiceEmailDto {
  /** Invoice ids to email — one email per invoice, each to its own customer. */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  invoiceIds: string[];

  /** Pick a saved email template as the subject/body base (rendered per-invoice). */
  @IsOptional()
  @IsString()
  templateId?: string;

  /** Custom subject — used when no templateId is provided. Rendered per-invoice. */
  @IsOptional()
  @IsString()
  customSubject?: string;

  /** Custom HTML body — used when no templateId is provided. Rendered per-invoice. */
  @IsOptional()
  @IsString()
  customBodyHtml?: string;

  /** Comma-separated CC email addresses, applied to every invoice in this send. */
  @IsOptional()
  @IsString()
  cc?: string;

  /** Comma-separated BCC email addresses, applied to every invoice in this send. */
  @IsOptional()
  @IsString()
  bcc?: string;
}
