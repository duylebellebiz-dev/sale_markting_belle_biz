import { IsIn, IsOptional } from 'class-validator';

export class CommitInvoiceImportDto {
  @IsOptional()
  @IsIn(['skip', 'update'])
  duplicateAction?: 'skip' | 'update';

  @IsOptional()
  @IsIn(['create', 'skip'])
  unknownClientAction?: 'create' | 'skip';
}
