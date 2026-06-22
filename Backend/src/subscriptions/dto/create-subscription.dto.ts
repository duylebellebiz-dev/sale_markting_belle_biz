import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateSubscriptionDto {
  @IsString()
  customerId: string;

  @IsString()
  serviceId: string;

  @IsOptional()
  @IsString()
  invoiceId?: string;

  @IsOptional()
  @IsDateString()
  closingDate?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsDateString()
  expiryDate: string;

  // If omitted the service's current price is snapshotted automatically
  @IsOptional()
  @IsNumber()
  @Min(0)
  servicePrice?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
