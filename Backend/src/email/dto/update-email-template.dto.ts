import { IsEnum, IsOptional, IsString, IsNotEmpty } from 'class-validator';
import type { EmailTemplateType } from '../email-template-type';

const TEMPLATE_TYPES = [
  'welcome',
  'followup',
  'invoice_reminder',
  'renewal',
  'thank_you',
  'custom',
] as const;

export class UpdateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @IsEnum(TEMPLATE_TYPES)
  @IsOptional()
  type?: EmailTemplateType;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  subject?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  bodyHtml?: string;
}
