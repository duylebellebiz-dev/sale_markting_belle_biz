import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateMailgunSettingsDto {
  @IsString()
  @MinLength(1, { message: 'Mailgun API key is required' })
  apiKey!: string;

  @IsString()
  @MinLength(1, { message: 'Mailgun sending domain is required' })
  domain!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}
