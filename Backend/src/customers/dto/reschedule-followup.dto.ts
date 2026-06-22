import { IsDateString, IsOptional, IsString } from 'class-validator';

export class RescheduleFollowUpDto {
  @IsDateString()
  nextFollowUpAt: string;

  @IsOptional()
  @IsString()
  note?: string;
}
