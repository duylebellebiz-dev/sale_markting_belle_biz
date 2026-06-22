import { IsString, MinLength } from 'class-validator';

export class UpdateClaudeKeyDto {
  @IsString()
  @MinLength(10, { message: 'API key is too short' })
  apiKey!: string;
}
