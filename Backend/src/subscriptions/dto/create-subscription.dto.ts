import {
  IsBoolean,
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

  // When true (and invoiceId is not set), a Draft invoice for this service is
  // created automatically and linked, instead of requiring a separate trip
  // to the Invoices module first.
  @IsOptional()
  @IsBoolean()
  createInvoice?: boolean;

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
