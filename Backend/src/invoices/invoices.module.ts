import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { ResendEmailService } from '../email/resend-email.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, ResendEmailService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
