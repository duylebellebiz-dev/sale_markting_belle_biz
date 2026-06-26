import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceActivityType, InvoiceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ResendEmailService } from '../email/resend-email.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { CreateInvoiceDto, LineItemDto } from './dto/create-invoice.dto';
import { UpdateInvoiceDto } from './dto/update-invoice.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { UpdatePromisedDateDto } from './dto/update-promised-date.dto';
import { SendInvoiceEmailDto } from './dto/send-invoice-email.dto';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// ─── Relations included on every invoice response ──────────────────────────────
const INVOICE_INCLUDE = {
  lineItems: { orderBy: { sortOrder: 'asc' as const } },
  payments:  { orderBy: { date:      'asc' as const } },
  customer: {
    select: {
      id: true,
      customerName: true,
      shopName: true,
      shopAddress: true,
      email: true,
      phoneNumber: true,
      assignedToId: true,
    },
  },
} satisfies Prisma.InvoiceInclude;

const INVOICE_DETAIL_INCLUDE = {
  ...INVOICE_INCLUDE,
  activities: { orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.InvoiceInclude;

type DbClient = PrismaService | Prisma.TransactionClient;

// ─── Server-side totals computation ────────────────────────────────────────────

function r2(n: number) {
  return Math.round(n * 100) / 100;
}

interface ComputedItem {
  serviceId:   string | null;
  description: string;
  serviceTerm: string;
  quantity:    number;
  rate:        number;
  amount:      number;
}

interface ComputedTotals {
  lineItems:  ComputedItem[];
  subTotal:   number;
  taxAmount:  number;
  total:      number;
  balanceDue: number;
}

interface InvoiceBillToSnapshot {
  name: string;
  addressLine: string;
  email: string;
  phone: string;
}

interface ParsedInvoiceNumber {
  prefix: string;
  padding: number;
  value: number;
}

function computeTotals(
  rawItems: LineItemDto[],
  discount: number,
  shippingCharges: number,
  adjustment: number,
  taxRate: number,
  amountPaid: number,
): ComputedTotals {
  const lineItems: ComputedItem[] = rawItems.map((i) => ({
    serviceId:   i.serviceId ?? null,
    description: i.description,
    serviceTerm: i.serviceTerm ?? '',
    quantity:    i.quantity,
    rate:        i.rate,
    amount:      r2(i.quantity * i.rate),
  }));

  const subTotal      = r2(lineItems.reduce((s, i) => s + i.amount, 0));
  const discountAmount = r2(subTotal * discount / 100);
  const afterDiscount = r2(subTotal - discountAmount);
  const taxableBase   = r2(afterDiscount + shippingCharges + adjustment);
  const taxAmount     = r2(taxableBase * taxRate / 100);
  const total         = r2(taxableBase + taxAmount);
  const balanceDue    = r2(total - amountPaid);

  return { lineItems, subTotal, taxAmount, total, balanceDue };
}

/** Replace {variable} tokens with context values. Unknown tokens → empty string. */
function renderTemplate(html: string, ctx: Record<string, string>): string {
  return html.replace(/\{(\w+)\}/g, (_, key: string) => ctx[key] ?? '');
}

function parseInvoiceNumber(value: string): ParsedInvoiceNumber | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) return null;
  return {
    prefix: match[1],
    padding: match[2].length,
    value: parseInt(match[2], 10),
  };
}

function formatInvoiceNumber(prefix: string, value: number, padding: number) {
  return `${prefix}${String(value).padStart(Math.max(padding, 1), '0')}`;
}

function compactDateForFilename(d?: string | Date | null): string {
  if (!d) return '000000';
  const dt = new Date(d as string);
  if (Number.isNaN(dt.getTime())) return '000000';
  const yy = String(dt.getFullYear()).slice(-2);
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function sanitizeFilenamePart(value?: string | null): string {
  const cleaned = (value ?? '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'Invoice';
}

function buildInvoicePdfFilename(invoice: any): string {
  const datePart = compactDateForFilename(invoice.invoiceDate);
  const invoicePart = sanitizeFilenamePart(invoice.invoiceNumber || 'invoice');
  const namePart = sanitizeFilenamePart(
    invoice.billTo?.name || invoice.customer?.shopName || invoice.customer?.customerName || 'Customer',
  );
  return `${datePart}-${invoicePart}-${namePart}.pdf`;
}

// ───────────────────────────────────────────────────────────────────────────────

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: ResendEmailService,
    private readonly pdfService: InvoicePdfService,
  ) {}

  // ---------------------------------------------------------------------------
  // Access helpers
  // ---------------------------------------------------------------------------

  private async resolveCustomer(user: RequestUser, customerId: string) {
    const where: Prisma.CustomerWhereInput = {
      id: customerId,
      businessId: user.businessId,
    };
    if (user.role === 'salesperson' && !user.permissions?.viewAllCustomers) {
      where.assignedToId = user.userId;
    }
    const customer = await this.prisma.customer.findFirst({ where });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async resolveInvoice(user: RequestUser, invoiceId: string, detailed = false) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, businessId: user.businessId },
      include: detailed ? INVOICE_DETAIL_INCLUDE : INVOICE_INCLUDE,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    if (user.role === 'salesperson' && !user.permissions?.viewAllCustomers) {
      if (invoice.customer.assignedToId !== user.userId) {
        throw new NotFoundException('Invoice not found');
      }
    }

    return invoice;
  }

  private buildBillToSnapshot(customer: {
    customerName?: string | null;
    shopName?: string | null;
    shopAddress?: string | null;
    email?: string | null;
    phoneNumber?: string | null;
  }): InvoiceBillToSnapshot {
    return {
      name: customer.shopName || customer.customerName || '',
      addressLine: customer.shopAddress ?? '',
      email: customer.email ?? '',
      phone: customer.phoneNumber ?? '',
    };
  }

  private async createInvoiceActivity(
    db: DbClient,
    params: {
      businessId: string;
      invoiceId: string;
      type: InvoiceActivityType;
      actorUserId?: string | null;
      note?: string;
      balanceSnapshot?: number | null;
    },
  ) {
    await db.invoiceActivity.create({
      data: {
        businessId: params.businessId,
        invoiceId: params.invoiceId,
        actorUserId: params.actorUserId ?? null,
        type: params.type,
        note: params.note ?? '',
        balanceSnapshot:
          params.balanceSnapshot != null
            ? new Prisma.Decimal(params.balanceSnapshot)
            : null,
      },
    });
  }

  private async peekConfiguredInvoiceNumber(db: DbClient, businessId: string): Promise<string> {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        invoiceNumberPrefix: true,
        invoiceNumberPadding: true,
        invoiceNumberCurrentValue: true,
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    let nextValue = (business.invoiceNumberCurrentValue ?? 0) + 1;
    const prefix = business.invoiceNumberPrefix ?? 'INV-';
    const padding = business.invoiceNumberPadding ?? 3;

    while (await db.invoice.findFirst({
      where: {
        businessId,
        invoiceNumber: formatInvoiceNumber(prefix, nextValue, padding),
      },
      select: { id: true },
    })) {
      nextValue += 1;
    }

    return formatInvoiceNumber(prefix, nextValue, padding);
  }

  private async reserveConfiguredInvoiceNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
  ): Promise<string> {
    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: {
        invoiceNumberPrefix: true,
        invoiceNumberPadding: true,
        invoiceNumberCurrentValue: true,
      },
    });
    if (!business) throw new NotFoundException('Business not found');

    let nextValue = (business.invoiceNumberCurrentValue ?? 0) + 1;
    const prefix = business.invoiceNumberPrefix ?? 'INV-';
    const padding = business.invoiceNumberPadding ?? 3;

    while (await tx.invoice.findFirst({
      where: {
        businessId,
        invoiceNumber: formatInvoiceNumber(prefix, nextValue, padding),
      },
      select: { id: true },
    })) {
      nextValue += 1;
    }

    await tx.business.update({
      where: { id: businessId },
      data: { invoiceNumberCurrentValue: nextValue },
    });

    return formatInvoiceNumber(prefix, nextValue, padding);
  }

  private async syncInvoiceCounterFromManualNumber(
    tx: Prisma.TransactionClient,
    businessId: string,
    invoiceNumber: string,
  ) {
    const parsed = parseInvoiceNumber(invoiceNumber);
    if (!parsed) return;

    const business = await tx.business.findUnique({
      where: { id: businessId },
      select: {
        invoiceNumberCurrentValue: true,
        invoiceNumberPrefix: true,
        invoiceNumberPadding: true,
      },
    });
    if (!business) return;

    const currentPrefix = business.invoiceNumberPrefix ?? 'INV-';
    const currentPadding = business.invoiceNumberPadding ?? 3;
    const fitsCurrentFormat = parsed.prefix === currentPrefix && parsed.padding === currentPadding;

    if (fitsCurrentFormat) {
      // Matches the configured scheme exactly — just advance the counter, never touch the format.
      if (parsed.value > (business.invoiceNumberCurrentValue ?? 0)) {
        await tx.business.update({
          where: { id: businessId },
          data: { invoiceNumberCurrentValue: parsed.value },
        });
      }
      return;
    }

    // A bare numeric string (no separator before the digits) is ambiguous — it could be
    // "<prefix><padded number>" with no separator, not a brand-new empty-prefix scheme.
    // Adopting it as-is would silently corrupt the prefix/padding for all future invoices.
    if (parsed.prefix === '') return;

    await tx.business.update({
      where: { id: businessId },
      data: {
        invoiceNumberPrefix: parsed.prefix,
        invoiceNumberPadding: parsed.padding,
        invoiceNumberCurrentValue: parsed.value,
      },
    });
  }

  private async getRewindInvoiceCounterValueBeforeDelete(
    db: DbClient,
    businessId: string,
    invoiceId: string,
    invoiceNumber: string,
  ): Promise<number | null> {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: {
        invoiceNumberCurrentValue: true,
        invoiceNumberPrefix: true,
        invoiceNumberPadding: true,
      },
    });
    if (!business) return null;

    const currentValue = business.invoiceNumberCurrentValue ?? 0;
    const prefix = business.invoiceNumberPrefix ?? 'INV-';
    const padding = business.invoiceNumberPadding ?? 3;

    // Only rewind when the deleted invoice is the one that last advanced the
    // counter (its number matches the business's current configured format
    // exactly), so deleting an older/manually-numbered invoice never disturbs
    // numbers issued after it.
    const matchesCurrentFormat = invoiceNumber === formatInvoiceNumber(prefix, currentValue, padding);

    if (!matchesCurrentFormat) return null;

    let rewindTo = 0;
    for (let value = currentValue - 1; value >= 1; value -= 1) {
      const existing = await db.invoice.findFirst({
        where: {
          businessId,
          invoiceNumber: formatInvoiceNumber(prefix, value, padding),
          NOT: { id: invoiceId },
        },
        select: { id: true },
      });
      if (existing) {
        rewindTo = value;
        break;
      }
    }

    return rewindTo;
  }

  // ---------------------------------------------------------------------------
  // Auto-generate sequential invoice number per business
  // ---------------------------------------------------------------------------

  async nextInvoiceNumber(businessId: string): Promise<string> {
    const count = await this.prisma.invoice.count({ where: { businessId } });
    const candidate = `INV-${String(count + 1).padStart(3, '0')}`;

    const exists = await this.prisma.invoice.findFirst({
      where: { businessId, invoiceNumber: candidate },
      select: { id: true },
    });
    if (!exists) return candidate;

    // Conflict after deletion — fall back to timestamp
    return `INV-${Date.now()}`;
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async previewNextInvoiceNumber(businessId: string): Promise<string> {
    return this.peekConfiguredInvoiceNumber(this.prisma, businessId);
  }

  async create(user: RequestUser, dto: CreateInvoiceDto) {
    const customer = await this.resolveCustomer(user, dto.customerId);

    return this.prisma.$transaction(async (tx) => {
      let invoiceNumber = dto.invoiceNumber?.trim();
      if (!invoiceNumber) {
        invoiceNumber = await this.reserveConfiguredInvoiceNumber(tx, user.businessId);
      } else {
        const dup = await tx.invoice.findFirst({
          where: { businessId: user.businessId, invoiceNumber },
          select: { id: true },
        });
        if (dup) throw new ConflictException('Invoice number already exists');
        await this.syncInvoiceCounterFromManualNumber(tx, user.businessId, invoiceNumber);
      }

      const business = await tx.business.findUnique({
        where: { id: user.businessId },
        select: { defaultTaxRate: true, defaultCustomerNote: true, defaultTerms: true },
      });

      const taxRate        = dto.taxRate        ?? business?.defaultTaxRate ?? 0;
      const discount       = dto.discount       ?? 0;
      const shippingCharges = dto.shippingCharges ?? 0;
      const adjustment     = dto.adjustment     ?? 0;
      const computed = computeTotals(dto.lineItems, discount, shippingCharges, adjustment, taxRate, 0);
      const billTo = this.buildBillToSnapshot(customer);

      return tx.invoice.create({
        data: {
          businessId:      user.businessId,
          customerId:      customer.id,
          invoiceNumber,
          invoiceDate:     dto.invoiceDate ? new Date(dto.invoiceDate) : new Date(),
          dueDate:         dto.dueDate ? new Date(dto.dueDate) : undefined,
          terms:           dto.terms ?? '',
          billTo:          billTo as unknown as Prisma.InputJsonValue,
          subTotal:        computed.subTotal,
          discount,
          shippingCharges,
          adjustment,
          taxRate,
          province:        dto.province ?? '',
          taxLabel:        dto.taxLabel ?? '',
          taxAmount:       computed.taxAmount,
          total:           computed.total,
          amountPaid:      0,
          balanceDue:      computed.balanceDue,
          customerNote:    dto.customerNote    ?? business?.defaultCustomerNote ?? '',
          termsConditions: dto.terms_conditions ?? business?.defaultTerms       ?? '',
          status:          InvoiceStatus.Draft,
          lineItems: {
            create: computed.lineItems.map((item, i) => ({
              serviceId:   item.serviceId,
              description: item.description,
              serviceTerm: item.serviceTerm,
              quantity:    item.quantity,
              rate:        item.rate,
              amount:      item.amount,
              sortOrder:   i,
            })),
          },
        },
        include: INVOICE_INCLUDE,
      });
    });
  }

  async findAll(user: RequestUser) {
    const rows = await this.prisma.invoice.findMany({
      where: { businessId: user.businessId },
      include: INVOICE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    if (user.role === 'salesperson' && !user.permissions?.viewAllCustomers) {
      return rows.filter((inv) => inv.customer.assignedToId === user.userId);
    }

    return rows;
  }

  async findOne(user: RequestUser, id: string) {
    return this.resolveInvoice(user, id, true);
  }

  async findByCustomer(user: RequestUser, customerId: string) {
    await this.resolveCustomer(user, customerId);
    return this.prisma.invoice.findMany({
      where: { businessId: user.businessId, customerId },
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async update(user: RequestUser, id: string, dto: UpdateInvoiceDto) {
    const existing = await this.resolveInvoice(user, id);
    const customer = dto.customerId
      ? await this.resolveCustomer(user, dto.customerId)
      : existing.customer;

    if (dto.invoiceNumber) {
      const conflict = await this.prisma.invoice.findFirst({
        where: {
          businessId:    user.businessId,
          invoiceNumber: dto.invoiceNumber,
          NOT: { id },
        },
        select: { id: true },
      });
      if (conflict) throw new ConflictException('Invoice number already exists');
    }

    // Build scalar updates
    const scalarData: Prisma.InvoiceUpdateInput = {};
    if (dto.invoiceNumber     !== undefined) scalarData.invoiceNumber     = dto.invoiceNumber;
    if (dto.invoiceDate       !== undefined) scalarData.invoiceDate       = new Date(dto.invoiceDate);
    if (dto.dueDate           !== undefined) scalarData.dueDate           = new Date(dto.dueDate);
    if (dto.terms             !== undefined) scalarData.terms             = dto.terms;
    if (dto.customerNote      !== undefined) scalarData.customerNote      = dto.customerNote;
    if (dto.terms_conditions  !== undefined) scalarData.termsConditions   = dto.terms_conditions;
    if (dto.province          !== undefined) scalarData.province          = dto.province;
    if (dto.taxLabel          !== undefined) scalarData.taxLabel          = dto.taxLabel;
    if (dto.customerId        !== undefined) scalarData.customer          = { connect: { id: customer.id } };
    scalarData.billTo = this.buildBillToSnapshot(customer) as unknown as Prisma.InputJsonValue;

    const anyPriceChanged =
      dto.discount       !== undefined ||
      dto.shippingCharges !== undefined ||
      dto.adjustment     !== undefined ||
      dto.taxRate        !== undefined;

    if (dto.lineItems) {
      // Recompute from new line items via transaction: delete old rows, recreate
      const discount       = dto.discount       ?? Number(existing.discount);
      const shippingCharges = dto.shippingCharges ?? Number(existing.shippingCharges);
      const adjustment     = dto.adjustment     ?? Number(existing.adjustment);
      const taxRate        = dto.taxRate        ?? existing.taxRate;
      const amountPaid     = Number(existing.amountPaid);

      const computed = computeTotals(dto.lineItems, discount, shippingCharges, adjustment, taxRate, amountPaid);

      return this.prisma.$transaction(async (tx) => {
        await tx.invoiceLineItem.deleteMany({ where: { invoiceId: id } });
        return tx.invoice.update({
          where: { id },
          data: {
            ...scalarData,
            subTotal:        computed.subTotal,
            discount,
            shippingCharges,
            adjustment,
            taxRate,
            taxAmount:       computed.taxAmount,
            total:           computed.total,
            balanceDue:      computed.balanceDue,
            lineItems: {
              create: computed.lineItems.map((item, i) => ({
                serviceId:   item.serviceId,
                description: item.description,
                serviceTerm: item.serviceTerm,
                quantity:    item.quantity,
                rate:        item.rate,
                amount:      item.amount,
                sortOrder:   i,
              })),
            },
          },
          include: INVOICE_DETAIL_INCLUDE,
        });
      });
    } else if (anyPriceChanged) {
      // Recompute totals from existing line items (no table changes)
      const discount       = dto.discount       ?? Number(existing.discount);
      const shippingCharges = dto.shippingCharges ?? Number(existing.shippingCharges);
      const adjustment     = dto.adjustment     ?? Number(existing.adjustment);
      const taxRate        = dto.taxRate        ?? existing.taxRate;
      const amountPaid     = Number(existing.amountPaid);

      const existingItemsAsDto: LineItemDto[] = existing.lineItems.map((li) => ({
        serviceId:   li.serviceId ?? undefined,
        description: li.description,
        serviceTerm: li.serviceTerm,
        quantity:    Number(li.quantity),
        rate:        Number(li.rate),
      }));

      const computed = computeTotals(existingItemsAsDto, discount, shippingCharges, adjustment, taxRate, amountPaid);

      return this.prisma.invoice.update({
        where: { id },
        data: {
          ...scalarData,
          subTotal:        computed.subTotal,
          discount,
          shippingCharges,
          adjustment,
          taxRate,
          taxAmount:       computed.taxAmount,
          total:           computed.total,
          balanceDue:      computed.balanceDue,
        },
        include: INVOICE_DETAIL_INCLUDE,
      });
    } else {
      return this.prisma.invoice.update({
        where: { id },
        data:  scalarData,
        include: INVOICE_DETAIL_INCLUDE,
      });
    }
  }

  async remove(user: RequestUser, id: string) {
    const invoice = await this.resolveInvoice(user, id);
    const rewindTo = await this.getRewindInvoiceCounterValueBeforeDelete(
      this.prisma,
      user.businessId,
      id,
      invoice.invoiceNumber,
    );

    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.subscription.updateMany({
        where: { businessId: user.businessId, invoiceId: id },
        data: { invoiceId: null },
      }),
      this.prisma.invoice.delete({ where: { id } }),
    ];

    if (rewindTo != null) {
      ops.push(
        this.prisma.business.update({
          where: { id: user.businessId },
          data: { invoiceNumberCurrentValue: rewindTo },
        }),
      );
    }

    await this.prisma.$transaction(ops);
    return { message: 'Invoice deleted' };
  }

  // ---------------------------------------------------------------------------
  // Status actions
  // ---------------------------------------------------------------------------

  async markSent(user: RequestUser, id: string) {
    const invoice = await this.resolveInvoice(user, id);
    if (invoice.status === InvoiceStatus.Cancelled) {
      throw new BadRequestException('Cannot mark a cancelled invoice as sent');
    }
    if (invoice.status === InvoiceStatus.Paid) {
      throw new BadRequestException('Invoice is already paid');
    }
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          status:        InvoiceStatus.Sent,
          dateSent:      now,
          reminderStep:  0,
          nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
        include: INVOICE_DETAIL_INCLUDE,
      });
      await this.createInvoiceActivity(tx, {
        businessId: user.businessId,
        invoiceId: id,
        actorUserId: user.userId,
        type: InvoiceActivityType.sent,
        note: 'Invoice marked as sent.',
        balanceSnapshot: Number(updated.balanceDue),
      });
      return updated;
    });
  }

  async markUnpaid(user: RequestUser, id: string) {
    const invoice = await this.resolveInvoice(user, id);
    if (invoice.status === InvoiceStatus.Cancelled) {
      throw new BadRequestException('Cannot reactivate a cancelled invoice');
    }
    return this.prisma.invoice.update({
      where: { id },
      data: {
        status:        InvoiceStatus.Sent,
        reminderStep:  0,
        nextReminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: INVOICE_DETAIL_INCLUDE,
    });
  }

  async cancel(user: RequestUser, id: string) {
    await this.resolveInvoice(user, id);
    return this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.Cancelled, nextReminderAt: null },
      include: INVOICE_DETAIL_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------------
  // Payment management (§7.2 / §12.4)
  // ---------------------------------------------------------------------------

  /** Aggregate all Payment rows for this invoice and update amountPaid/balanceDue/status. */
  private async recomputeAndSavePayments(
    invoiceId: string,
    total: number,
    currentStatus: InvoiceStatus,
  ) {
    const agg = await this.prisma.payment.aggregate({
      where: { invoiceId },
      _sum: { amount: true },
    });
    const amountPaid = r2(Number(agg._sum.amount ?? 0));
    const balanceDue = r2(total - amountPaid);

    let status: InvoiceStatus;
    if (balanceDue <= 0) {
      status = InvoiceStatus.Paid;
    } else if (amountPaid > 0) {
      status = InvoiceStatus.PartiallyPaid;
    } else {
      status = currentStatus === InvoiceStatus.Overdue
        ? InvoiceStatus.Overdue
        : InvoiceStatus.Sent;
    }

    return this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountPaid,
        balanceDue,
        status,
        ...(balanceDue <= 0 && { nextReminderAt: null }),
      },
      include: INVOICE_DETAIL_INCLUDE,
    });
  }

  async markPaid(user: RequestUser, id: string, dto: AddPaymentDto) {
    const invoice = await this.resolveInvoice(user, id);
    if (invoice.status === InvoiceStatus.Cancelled) {
      throw new BadRequestException('Cannot mark a cancelled invoice as paid');
    }

    await this.prisma.payment.create({
      data: {
        invoiceId: id,
        date:      dto.date ? new Date(dto.date) : new Date(),
        amount:    dto.amount,
        method:    dto.method ?? '',
        note:      dto.note   ?? '',
      },
    });

    return this.recomputeAndSavePayments(id, Number(invoice.total), invoice.status);
  }

  async addPayment(user: RequestUser, id: string, dto: AddPaymentDto) {
    const invoice = await this.resolveInvoice(user, id);
    if (invoice.status === InvoiceStatus.Cancelled) {
      throw new BadRequestException('Cannot add a payment to a cancelled invoice');
    }

    await this.prisma.payment.create({
      data: {
        invoiceId: id,
        date:      dto.date ? new Date(dto.date) : new Date(),
        amount:    dto.amount,
        method:    dto.method ?? '',
        note:      dto.note   ?? '',
      },
    });

    return this.recomputeAndSavePayments(id, Number(invoice.total), invoice.status);
  }

  async removePayment(user: RequestUser, id: string, paymentId: string) {
    const invoice = await this.resolveInvoice(user, id);
    if (invoice.status === InvoiceStatus.Cancelled) {
      throw new BadRequestException('Cannot remove a payment from a cancelled invoice');
    }

    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, invoiceId: id },
    });
    if (!payment) throw new NotFoundException('Payment entry not found');

    await this.prisma.payment.delete({ where: { id: paymentId } });

    const result = await this.recomputeAndSavePayments(id, Number(invoice.total), invoice.status);

    // Re-arm reminders if balance went back to positive
    if (Number(result.balanceDue) > 0 && !result.nextReminderAt) {
      return this.prisma.invoice.update({
        where: { id },
        data: {
          nextReminderAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          reminderStep:   0,
        },
        include: INVOICE_DETAIL_INCLUDE,
      });
    }

    return result;
  }

  async updatePromisedDate(user: RequestUser, id: string, dto: UpdatePromisedDateDto) {
    await this.resolveInvoice(user, id);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        promisedPaymentDate: dto.promisedPaymentDate
          ? new Date(dto.promisedPaymentDate)
          : null,
      },
      include: INVOICE_DETAIL_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------------
  // Email invoice with PDF attached (§12.3b)
  // ---------------------------------------------------------------------------

  async sendInvoiceEmail(
    user: RequestUser,
    invoiceId: string,
    dto: SendInvoiceEmailDto,
  ): Promise<{ message: string }> {
    const invoice = await this.resolveInvoice(user, invoiceId);

    const billTo = invoice.billTo as any;
    const recipientEmail: string | null =
      billTo?.email || invoice.customer.email || null;

    if (!recipientEmail) {
      throw new BadRequestException(
        'Customer has no email address. Please add an email to the customer record first.',
      );
    }

    const biz = await this.prisma.business.findUnique({
      where: { id: user.businessId },
      select: { businessName: true },
    });
    const bizName = biz?.businessName ?? 'us';

    const firstItem = invoice.lineItems[0] as any;
    const ctx: Record<string, string> = {
      customer_name:    billTo?.name || 'Valued Customer',
      shop_name:        invoice.customer.shopName || '',
      invoice_amount:   `$${Number(invoice.total).toFixed(2)}`,
      service_name:     firstItem?.description || '',
      expiry_date:      '',
      salesperson_name: '',
    };

    let subject: string;
    let bodyHtml: string;

    if (dto.customSubject || dto.customBodyHtml) {
      subject  = dto.customSubject  || `Invoice #${invoice.invoiceNumber} from ${bizName}`;
      bodyHtml = dto.customBodyHtml || this.defaultInvoiceHtml(invoice, ctx, bizName);
    } else if (dto.templateId) {
      const tpl = await this.prisma.emailTemplate.findFirst({
        where: { id: dto.templateId, businessId: user.businessId },
      });
      if (!tpl) throw new BadRequestException('Email template not found');
      subject  = renderTemplate(tpl.subject,  ctx);
      bodyHtml = renderTemplate(tpl.bodyHtml, ctx);
    } else {
      subject  = `Invoice #${invoice.invoiceNumber} from ${bizName}`;
      bodyHtml = this.defaultInvoiceHtml(invoice, ctx, bizName);
    }

    const pdfBuffer = await this.pdfService.generateBuffer(invoice, user.businessId);

    const providerMessageId = await this.emailService.send({
      businessId: user.businessId,
      to: recipientEmail,
      subject,
      html: bodyHtml,
      attachments: [
        {
          filename:    buildInvoicePdfFilename(invoice),
          content:     pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    await this.prisma.emailLog.create({
      data: {
        businessId:       user.businessId,
        customerId:       invoice.customerId,
        to:               recipientEmail,
        subject,
        status:           'sent',
        providerMessageId,
        sentAt:           new Date(),
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status:        InvoiceStatus.Sent,
          dateSent:      now,
          reminderStep:  0,
          nextReminderAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      await this.createInvoiceActivity(tx, {
        businessId: user.businessId,
        invoiceId,
        actorUserId: user.userId,
        type: InvoiceActivityType.emailed,
        note: `Invoice emailed to ${recipientEmail}.`,
        balanceSnapshot: Number(invoice.balanceDue),
      });
    });

    return { message: 'Invoice emailed successfully' };
  }

  private defaultInvoiceHtml(invoice: any, ctx: Record<string, string>, bizName: string): string {
    return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151;">
<h2 style="color:#111827;">Invoice #${invoice.invoiceNumber}</h2>
<p>Dear ${ctx.customer_name},</p>
<p>Please find your invoice attached to this email.</p>
<table style="width:100%;border-collapse:collapse;margin:20px 0;">
  <tr><td style="padding:8px;border:1px solid #E5E7EB;color:#6B7280;">Invoice #</td>
      <td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">${invoice.invoiceNumber}</td></tr>
  <tr><td style="padding:8px;border:1px solid #E5E7EB;color:#6B7280;">Total</td>
      <td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">${ctx.invoice_amount}</td></tr>
  <tr><td style="padding:8px;border:1px solid #E5E7EB;color:#6B7280;">Balance Due</td>
      <td style="padding:8px;border:1px solid #E5E7EB;font-weight:bold;">$${Number(invoice.balanceDue ?? 0).toFixed(2)}</td></tr>
</table>
${invoice.customerNote ? `<p style="color:#6B7280;">${invoice.customerNote}</p>` : ''}
<p>Thank you for your business!</p>
<p style="color:#6B7280;font-size:12px;">— ${bizName}</p>
</div>`;
  }

  // ---------------------------------------------------------------------------
  // Used internally by the reminder engine — no auth scoping
  // ---------------------------------------------------------------------------

  findDueInvoices() {
    const now = new Date();
    return this.prisma.invoice.findMany({
      where: {
        status: { in: [InvoiceStatus.Sent, InvoiceStatus.Overdue, InvoiceStatus.PartiallyPaid] },
        balanceDue: { gt: 0 },
        OR: [
          { nextReminderAt:      { lte: now } },
          { promisedPaymentDate: { lte: now } },
        ],
      },
      include: {
        customer: {
          select: { id: true, customerName: true, assignedToId: true, businessId: true },
        },
      },
    });
  }

  async advanceInvoiceReminder(invoiceId: string, schedule: number[], note?: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { reminderStep: true, status: true, businessId: true, balanceDue: true },
    });
    if (!invoice) return null;

    const nextStep  = invoice.reminderStep + 1;
    const dayOffset = schedule[nextStep] ?? schedule[schedule.length - 1] ?? 7;
    const now = new Date();
    const nextReminderAt = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);

    // Escalate Sent → Overdue on first advance
    const statusUpdate: Partial<{ status: InvoiceStatus }> = {};
    if (invoice.status === InvoiceStatus.Sent && nextStep > 0) {
      statusUpdate.status = InvoiceStatus.Overdue;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          reminderStep:       nextStep,
          nextReminderAt,
          lastReminderAt:     now,
          promisedPaymentDate: null,
          ...statusUpdate,
        },
      });
      await this.createInvoiceActivity(tx, {
        businessId: invoice.businessId,
        invoiceId,
        type: InvoiceActivityType.reminder,
        note: note ?? 'Invoice reminder sent.',
        balanceSnapshot: Number(invoice.balanceDue),
      });
      return updated;
    });
  }
}
