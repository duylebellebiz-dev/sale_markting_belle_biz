import { IsIn, IsOptional } from 'class-validator';

export class CommitImportDto {
  @IsOptional()
  @IsIn(['skip', 'update'])
  duplicateAction?: 'skip' | 'update';
}
