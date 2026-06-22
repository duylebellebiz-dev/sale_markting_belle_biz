import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RenewSubscriptionDto {
  @IsDateString()
  expiryDate: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  servicePrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
