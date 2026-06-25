import {
  ArrayMinSize,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { LineItemDto } from './create-invoice.dto';

export class UpdateInvoiceDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  invoiceNumber?: string;

  @IsOptional()
  @IsDateString()
  invoiceDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  terms?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => LineItemDto)
  @ArrayMinSize(1)
  lineItems?: LineItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  shippingCharges?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  adjustment?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customerNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  terms_conditions?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  province?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxLabel?: string;
}
