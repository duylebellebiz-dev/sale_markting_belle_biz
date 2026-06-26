import {
  IsBoolean,
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

  // When true (and invoiceId is not set), a Draft invoice for the new period
  // is created automatically and linked.
  @IsOptional()
  @IsBoolean()
  createInvoice?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  servicePrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
