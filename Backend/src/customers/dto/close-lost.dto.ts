import { IsOptional, IsString } from 'class-validator';

export class CloseLostDto {
  @IsOptional()
  @IsString()
  note?: string;
}
