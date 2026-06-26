import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FollowUpHistoryType, PipelineStage, Prisma, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InvoicesService } from '../invoices/invoices.service';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { RenewSubscriptionDto } from './dto/renew-subscription.dto';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// Fields returned on subscription list/detail responses
const SUB_INCLUDE = {
  customer: { select: { id: true, customerName: true, shopName: true, assignedToId: true } },
  service:  { select: { id: true, name: true, price: true } },
  invoice:  { select: { id: true, invoiceNumber: true, total: true, status: true } },
} as const;

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  // Creates a Draft invoice for one period of a service, used when the caller
  // opts into auto-creating an invoice instead of linking an existing one.
  private async autoCreateInvoice(
    user: RequestUser,
    customerId: string,
    serviceId: string,
    serviceName: string,
    servicePrice: number,
    startDate: Date,
    expiryDate: Date,
  ) {
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const invoice = await this.invoicesService.create(user, {
      customerId,
      lineItems: [
        {
          serviceId,
          description: serviceName,
          serviceTerm: `${fmt(startDate)} - ${fmt(expiryDate)}`,
          quantity: 1,
          rate: servicePrice,
        },
      ],
    });
    return invoice.id;
  }

  // ---------------------------------------------------------------------------
  // Access-control helpers
  // ---------------------------------------------------------------------------

  private async resolveCustomer(user: RequestUser, customerId: string) {
    const where: Prisma.CustomerWhereInput = {
      id: customerId,
      businessId: user.businessId,
    };
    if (user.role === 'salesperson') {
      where.assignedToId = user.userId;
    }
    const customer = await this.prisma.customer.findFirst({ where });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async resolveSub(user: RequestUser, subId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subId, businessId: user.businessId },
      include: { customer: { select: { assignedToId: true } } },
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    if (user.role === 'salesperson' && sub.customer.assignedToId !== user.userId) {
      throw new NotFoundException('Subscription not found');
    }

    return sub;
  }

  // ---------------------------------------------------------------------------
  // Create — transaction: insert subscription + mark customer Closed Won (§7 / §6)
  // ---------------------------------------------------------------------------
  async create(user: RequestUser, dto: CreateSubscriptionDto) {
    const customer = await this.resolveCustomer(user, dto.customerId);

    const service = await this.prisma.service.findFirst({
      where: { id: dto.serviceId, businessId: user.businessId },
    });
    if (!service) throw new NotFoundException('Service not found');

    const now = new Date();
    const expiryDate = new Date(dto.expiryDate);
    const startDate = dto.startDate ? new Date(dto.startDate) : now;
    const servicePrice = dto.servicePrice ?? Number(service.price);

    let invoiceId = dto.invoiceId ?? null;
    if (!invoiceId && dto.createInvoice) {
      invoiceId = await this.autoCreateInvoice(
        user, customer.id, service.id, service.name, servicePrice, startDate, expiryDate,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          businessId: user.businessId,
          customerId: customer.id,
          serviceId: service.id,
          servicePrice,
          invoiceId,
          closingDate: dto.closingDate ? new Date(dto.closingDate) : now,
          startDate,
          expiryDate,
          status: SubscriptionStatus.Active,
          nextReminderAt: this.daysBeforeExpiry(expiryDate, 5),
          reminderStep: 0,
          note: dto.note ?? '',
        },
        include: SUB_INCLUDE,
      });

      // Mark the customer as Closed Won so follow-up reminders stop
      await tx.customer.update({
        where: { id: customer.id },
        data: { isClosed: true, stage: PipelineStage.ClosedWon },
      });

      await tx.followUpHistory.create({
        data: {
          businessId: user.businessId,
          customerId: customer.id,
          actorUserId: user.userId,
          type: FollowUpHistoryType.closed_won,
          note: dto.note ?? '',
        },
      });

      return sub;
    });
  }

  // ---------------------------------------------------------------------------
  // Read
  // ---------------------------------------------------------------------------
  async findAll(user: RequestUser) {
    const subs = await this.prisma.subscription.findMany({
      where: { businessId: user.businessId },
      include: SUB_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    if (user.role === 'salesperson') {
      return subs.filter((s) => s.customer.assignedToId === user.userId);
    }

    return subs;
  }

  async findOne(user: RequestUser, id: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id, businessId: user.businessId },
      include: SUB_INCLUDE,
    });
    if (!sub) throw new NotFoundException('Subscription not found');

    if (user.role === 'salesperson' && sub.customer.assignedToId !== user.userId) {
      throw new NotFoundException('Subscription not found');
    }

    return sub;
  }

  async findByCustomer(user: RequestUser, customerId: string) {
    // Validates access first
    await this.resolveCustomer(user, customerId);

    return this.prisma.subscription.findMany({
      where: { businessId: user.businessId, customerId },
      include: {
        service: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true, total: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ---------------------------------------------------------------------------
  // Renew
  // ---------------------------------------------------------------------------
  async renew(user: RequestUser, id: string, dto: RenewSubscriptionDto) {
    const sub = await this.resolveSub(user, id);

    if (sub.status === SubscriptionStatus.Cancelled) {
      throw new BadRequestException('Cannot renew a cancelled subscription');
    }

    const newExpiry = new Date(dto.expiryDate);
    const newStart  = dto.startDate ? new Date(dto.startDate) : new Date();
    const servicePrice = dto.servicePrice ?? Number(sub.servicePrice);

    let invoiceId = dto.invoiceId;
    if (!invoiceId && dto.createInvoice) {
      const service = await this.prisma.service.findUnique({ where: { id: sub.serviceId } });
      invoiceId = await this.autoCreateInvoice(
        user, sub.customerId, sub.serviceId, service?.name ?? 'Service renewal',
        servicePrice, newStart, newExpiry,
      );
    }

    return this.prisma.subscription.update({
      where: { id },
      data: {
        status: SubscriptionStatus.Renewed,
        expiryDate: newExpiry,
        startDate: newStart,
        ...(invoiceId          !== undefined && { invoiceId }),
        ...(dto.servicePrice   !== undefined && { servicePrice: dto.servicePrice }),
        ...(dto.note           !== undefined && { note: dto.note }),
        reminderStep: 0,
        nextReminderAt: this.daysBeforeExpiry(newExpiry, 5),
      },
      include: SUB_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------------
  // Cancel
  // ---------------------------------------------------------------------------
  async cancel(user: RequestUser, id: string) {
    await this.resolveSub(user, id);

    return this.prisma.subscription.update({
      where: { id },
      data: { status: SubscriptionStatus.Cancelled, nextReminderAt: null },
      include: SUB_INCLUDE,
    });
  }

  // ---------------------------------------------------------------------------
  // Internal — reminder engine (no auth scoping)
  // ---------------------------------------------------------------------------

  findDueSubscriptions() {
    return this.prisma.subscription.findMany({
      where: {
        status: { in: [SubscriptionStatus.Active, SubscriptionStatus.Renewed] },
        nextReminderAt: { not: null, lte: new Date() },
      },
      include: {
        customer: {
          select: { id: true, assignedToId: true, customerName: true, businessId: true },
        },
        service: { select: { name: true } },
      },
    });
  }

  async advanceRenewalReminder(subId: string, schedule: number[]) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subId },
      select: { reminderStep: true, expiryDate: true, status: true },
    });
    if (!sub) return null;

    const nextStep  = sub.reminderStep + 1;
    const now       = new Date();
    const expiry    = sub.expiryDate;
    const lastOffset = schedule[schedule.length - 1];

    let nextReminderAt: Date;
    if (nextStep < schedule.length) {
      const candidate = new Date(expiry.getTime() - schedule[nextStep] * 86_400_000);
      nextReminderAt = candidate > now
        ? candidate
        : new Date(now.getTime() + lastOffset * 86_400_000);
    } else {
      nextReminderAt = new Date(now.getTime() + lastOffset * 86_400_000);
    }

    const isExpired = expiry < now && sub.status !== SubscriptionStatus.Expired;

    return this.prisma.subscription.update({
      where: { id: subId },
      data: {
        reminderStep: nextStep,
        nextReminderAt,
        ...(isExpired && { status: SubscriptionStatus.Expired }),
      },
    });
  }

  // ---------------------------------------------------------------------------
  private daysBeforeExpiry(expiry: Date, days: number): Date {
    const d = new Date(expiry.getTime() - days * 86_400_000);
    return d < new Date() ? new Date() : d;
  }
}
