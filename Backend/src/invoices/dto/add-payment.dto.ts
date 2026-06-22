import { IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class AddPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  method?: string; // e.g. 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card'

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
