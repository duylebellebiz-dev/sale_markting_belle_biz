import { ArrayMinSize, IsArray, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateReminderScheduleDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  invoiceReminderDays?: number[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  @Min(1, { each: true })
  renewalReminderDays?: number[];
}
