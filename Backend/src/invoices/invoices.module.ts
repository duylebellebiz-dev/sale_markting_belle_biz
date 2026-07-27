import { Module } from '@nestjs/common';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { MailgunEmailService } from '../email/mailgun-email.service';

@Module({
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, MailgunEmailService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
