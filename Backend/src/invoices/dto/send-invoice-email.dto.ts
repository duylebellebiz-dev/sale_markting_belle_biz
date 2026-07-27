import { IsOptional, IsString } from 'class-validator';

export class SendInvoiceEmailDto {
  /** Pick a saved email template as the subject/body base. */
  @IsOptional()
  @IsString()
  templateId?: string;

  /** Custom subject — used when no templateId is provided (or when the user edits it). */
  @IsOptional()
  @IsString()
  customSubject?: string;

  /**
   * Custom HTML body — the frontend sends the final rendered+edited HTML
   * so no server-side variable substitution is needed when this is present.
   */
  @IsOptional()
  @IsString()
  customBodyHtml?: string;

  /** Comma-separated extra "To" recipients, in addition to the customer's own email. */
  @IsOptional()
  @IsString()
  additionalTo?: string;

  /** Comma-separated CC email addresses. */
  @IsOptional()
  @IsString()
  cc?: string;

  /** Comma-separated BCC email addresses. */
  @IsOptional()
  @IsString()
  bcc?: string;
}
