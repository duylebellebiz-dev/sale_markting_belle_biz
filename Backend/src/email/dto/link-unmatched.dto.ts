import { IsString, MinLength } from 'class-validator';

export class LinkUnmatchedDto {
  @IsString()
  @MinLength(1)
  customerId!: string;
}
