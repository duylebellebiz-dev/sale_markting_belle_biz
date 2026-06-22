import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdatePromisedDateDto } from './dto/update-promised-date.dto';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { RequestUser } from '../common/decorators/current-user.decorator';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly invoicePdfService: InvoicePdfService,
  ) {}

  // --- CRUD ---

  @RequirePermission('createInvoice')
  @Post()
  create(@CurrentUser() user: RequestUser, @Body() dto: CreateInvoiceDto) {
    return this.invoicesService.create(user, dto);
  }

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.invoicesService.findAll(user);
  }

  // Static sub-paths must come before :id to avoid route conflicts
  @Get('next-number')
  nextNumber(@CurrentUser() user: RequestUser) {
    return this.invoicesService.nextInvoiceNumber(user.businessId);
  }

  @Get('by-customer/:customerId')
  findByCustomer(
    @CurrentUser() user: RequestUser,
    @Param('customerId') customerId: string,
  ) {
    return this.invoicesService.findByCustomer(user, customerId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.findOne(user, id);
  }

  // PDF export — after :id so NestJS resolves :id/pdf as a distinct path
  @RequirePermission('exportInvoicePdf')
  @Get(':id/pdf')
  async getPdf(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const invoice = await this.invoicesService.findOne(user, id);
    await this.invoicePdfService.streamPdf(invoice, user.businessId, res);
  }

  @RequirePermission('createInvoice')
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(user, id, dto);
  }

  @RequirePermission('createInvoice')
  @Delete(':id')
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.remove(user, id);
  }

  // --- Explicit status actions ---

  @RequirePermission('createInvoice')
  @Post(':id/send')
  markSent(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.markSent(user, id);
  }

  @RequirePermission('createInvoice')
  @Post(':id/mark-paid')
  markPaid(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.invoicesService.markPaid(user, id, dto);
  }

  @RequirePermission('createInvoice')
  @Post(':id/mark-unpaid')
  markUnpaid(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.markUnpaid(user, id);
  }

  @RequirePermission('createInvoice')
  @Post(':id/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.invoicesService.cancel(user, id);
  }

  // --- Payment history ---

  @RequirePermission('createInvoice')
  @Post(':id/payments')
  addPayment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
  ) {
    return this.invoicesService.addPayment(user, id, dto);
  }

  @RequirePermission('createInvoice')
  @Delete(':id/payments/:paymentId')
  removePayment(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.invoicesService.removePayment(user, id, paymentId);
  }

  @RequirePermission('createInvoice')
  @Patch(':id/promised-date')
  updatePromisedDate(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: UpdatePromisedDateDto,
  ) {
    return this.invoicesService.updatePromisedDate(user, id, dto);
  }

  @RequirePermission('sendEmail')
  @RequirePermission('exportInvoicePdf')
  @Post(':id/send-email')
  sendEmail(
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() dto: SendInvoiceEmailDto,
  ) {
    return this.invoicesService.sendInvoiceEmail(user, id, dto);
  }
}
