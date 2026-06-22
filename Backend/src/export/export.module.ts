import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportInvoiceService } from './import-invoice.service';

@Module({
  controllers: [ExportController, ImportController],
  providers: [ExportService, ImportService, ImportInvoiceService],
})
export class ExportModule {}
