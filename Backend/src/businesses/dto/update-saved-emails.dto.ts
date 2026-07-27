import { ArrayMaxSize, IsArray, IsEmail } from 'class-validator';

export class UpdateSavedEmailsDto {
  /** Quick-pick CC/BCC email addresses (e.g. accounting, manager). */
  @IsArray()
  @ArrayMaxSize(30, { message: 'You can save at most 30 email addresses' })
  @IsEmail({}, { each: true, message: 'Each saved address must be a valid email' })
  emails!: string[];
}
