import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateResendSettingsDto {
  @IsString()
  @MinLength(1, { message: 'Resend API key is required' })
  apiKey!: string;

  @IsEmail()
  fromEmail!: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}
