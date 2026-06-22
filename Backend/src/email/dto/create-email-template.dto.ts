import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { EmailTemplateType } from '../email-template-type';

const TEMPLATE_TYPES = [
  'welcome',
  'followup',
  'invoice_reminder',
  'renewal',
  'thank_you',
  'custom',
] as const;

export class CreateEmailTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(TEMPLATE_TYPES)
  @IsOptional()
  type?: EmailTemplateType;

  @IsString()
  @IsNotEmpty()
  subject: string;

  @IsString()
  @IsNotEmpty()
  bodyHtml: string;
}
