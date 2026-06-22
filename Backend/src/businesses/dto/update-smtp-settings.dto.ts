import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MinLength,
} from 'class-validator';

export class UpdateSmtpSettingsDto {
  @IsString()
  @MinLength(1)
  host!: string;

  @IsInt()
  @Max(65535)
  port!: number;

  @IsBoolean()
  secure!: boolean;

  @IsEmail()
  user!: string;

  @IsString()
  @MinLength(1, { message: 'password (app password) is required' })
  password!: string;

  @IsOptional()
  @IsString()
  fromName?: string;
}
