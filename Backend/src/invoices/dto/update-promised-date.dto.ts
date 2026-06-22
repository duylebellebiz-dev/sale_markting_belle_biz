import { IsDateString, IsOptional } from 'class-validator';

export class UpdatePromisedDateDto {
  @IsOptional()
  @IsDateString()
  promisedPaymentDate?: string; // null/omitted clears the field
}
