import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { EmailService } from '../email/email.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, EmailService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
