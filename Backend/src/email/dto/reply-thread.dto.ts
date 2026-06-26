import { IsString, MinLength } from 'class-validator';

export class ReplyThreadDto {
  @IsString()
  @MinLength(1)
  subject!: string;

  @IsString()
  @MinLength(1)
  bodyHtml!: string;
}
