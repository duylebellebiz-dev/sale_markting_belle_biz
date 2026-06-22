import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePermissionsDto {
  @IsOptional() @IsBoolean() viewAllCustomers?: boolean;
  @IsOptional() @IsBoolean() manageCustomers?: boolean;
  @IsOptional() @IsBoolean() sendEmail?: boolean;
  @IsOptional() @IsBoolean() manageEmailTemplates?: boolean;
  @IsOptional() @IsBoolean() createInvoice?: boolean;
  @IsOptional() @IsBoolean() exportInvoicePdf?: boolean;
  @IsOptional() @IsBoolean() manageServices?: boolean;
  @IsOptional() @IsBoolean() viewReports?: boolean;
  @IsOptional() @IsBoolean() exportExcel?: boolean;
  @IsOptional() @IsBoolean() importData?: boolean;
  @IsOptional() @IsBoolean() analyzeAds?: boolean;
  @IsOptional() @IsBoolean() manageStaff?: boolean;
}
