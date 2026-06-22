import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma, SubscriptionStatus } from '@prisma/client';
import { PipelineStage as CustomerStage } from '../customers/pipeline-stage.enum';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../common/decorators/current-user.decorator';

// ── Period helpers ────────────────────────────────────────────────────────────

function resolvePeriod(
  from?: string,
  to?: string,
): { periodStart: Date; periodEnd: Date; isAllTime: boolean } {
  if (from === 'all') {
    return {
      periodStart: new Date(2000, 0, 1),
      periodEnd: new Date(2100, 11, 31),
      isAllTime: true,
    };
  }
  if (from && to) {
    const start = new Date(from);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return { periodStart: start, periodEnd: end, isAllTime: false };
  }
  // Default: current month
  const now = new Date();
  return {
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    isAllTime: false,
  };
}

type BucketType = 'daily' | 'weekly' | 'monthly';

function getBucketType(start: Date, end: Date, isAllTime: boolean): BucketType {
  if (isAllTime) return 'monthly';
  const diffDays = (end.getTime() - start.getTime()) / 86_400_000;
  if (diffDays <= 31) return 'daily';
  if (diffDays <= 90) return 'weekly';
  return 'monthly';
}

function truncUnit(bucket: BucketType): 'day' | 'week' | 'month' {
  if (bucket === 'daily') return 'day';
  if (bucket === 'weekly') return 'week';
  return 'month';
}

export interface RevenueBucket {
  bucket: string;
  revenue: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // Revenue bucketed by Payment.date, optionally restricted to a salesperson.
  private async revenueChart(
    businessId: string,
    periodStart: Date,
    periodEnd: Date,
    isAllTime: boolean,
    bucket: BucketType,
    assignedToId?: string,
  ): Promise<RevenueBucket[]> {
    const unit = truncUnit(bucket);
    const dateFilter = isAllTime
      ? Prisma.empty
      : Prisma.sql`AND p."date" >= ${periodStart}::timestamptz AND p."date" <= ${periodEnd}::timestamptz`;
    const salesFilter = assignedToId
      ? Prisma.sql`AND c."assignedToId" = ${assignedToId}`
      : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{ bucket: Date; revenue: string }>>`
      SELECT DATE_TRUNC(${unit}, p."date"::timestamptz) AS bucket,
             COALESCE(SUM(p."amount"), 0) AS revenue
      FROM "Payment" p
      JOIN "Invoice" i ON i."id" = p."invoiceId"
      JOIN "Customer" c ON c."id" = i."customerId"
      WHERE i."businessId" = ${businessId}
        ${dateFilter}
        ${salesFilter}
      GROUP BY 1
      ORDER BY 1
    `;

    return rows.map((r) => ({
      bucket: r.bucket.toISOString(),
      revenue: Number(r.revenue),
    }));
  }

  // Sum of payments in period (optionally per salesperson).
  private async revenueTotal(
    businessId: string,
    periodStart: Date,
    periodEnd: Date,
    isAllTime: boolean,
    assignedToId?: string,
  ): Promise<number> {
    const where: Prisma.PaymentWhereInput = {
      invoice: {
        businessId,
        ...(assignedToId ? { customer: { assignedToId } } : {}),
      },
    };
    if (!isAllTime) where.date = { gte: periodStart, lte: periodEnd };

    const agg = await this.prisma.payment.aggregate({
      where,
      _sum: { amount: true },
    });
    return Number(agg._sum.amount ?? 0);
  }

  async ownerStats(user: RequestUser, from?: string, to?: string) {
    const businessId = user.businessId;
    const now = new Date();
    const in14Days = new Date(now.getTime() + 14 * 86_400_000);
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);

    const { periodStart, periodEnd, isAllTime } = resolvePeriod(from, to);
    const bucketType = getBucketType(periodStart, periodEnd, isAllTime);

    const customerPeriod: Prisma.CustomerWhereInput = isAllTime
      ? {}
      : { createdAt: { gte: periodStart, lte: periodEnd } };
    const invoiceDatePeriod: Prisma.InvoiceWhereInput = isAllTime
      ? {}
      : { invoiceDate: { gte: periodStart, lte: periodEnd } };

    const [
      monthlyRevenue,
      activeDeals,
      totalCustomers,
      overdueRows,
      expiringRows,
      conversionRows,
      outstandingAgg,
      partiallyPaidRows,
      promisedRows,
      revenueByMonth,
    ] = await Promise.all([
      // 1. Revenue in period
      this.revenueTotal(businessId, periodStart, periodEnd, isAllTime),

      // 2. Active deals — new leads created in period, not yet closed
      this.prisma.customer.count({
        where: {
          businessId,
          isClosed: false,
          stage: { notIn: [CustomerStage.ClosedWon, CustomerStage.ClosedLost] },
          ...customerPeriod,
        },
      }),

      // 3. Total customers (always current)
      this.prisma.customer.count({ where: { businessId } }),

      // 4. Overdue invoices (current status, invoiceDate filtered to period)
      this.prisma.invoice.findMany({
        where: { businessId, status: InvoiceStatus.Overdue, ...invoiceDatePeriod },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          balanceDue: true,
          invoiceDate: true,
          nextReminderAt: true,
          customer: { select: { customerName: true, shopName: true } },
        },
        orderBy: { invoiceDate: 'asc' },
      }),

      // 5. Subscriptions expiring within 30 days (forward-looking)
      this.prisma.subscription.findMany({
        where: {
          businessId,
          status: { in: [SubscriptionStatus.Active, SubscriptionStatus.Renewed] },
          expiryDate: { gte: now, lte: in30Days },
        },
        select: {
          id: true,
          expiryDate: true,
          status: true,
          servicePrice: true,
          customer: { select: { customerName: true, shopName: true } },
          service: { select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
      }),

      // 6. Conversion per salesperson — customers created in period
      this.prisma.customer.groupBy({
        by: ['assignedToId', 'stage'],
        where: { businessId, ...customerPeriod },
        _count: { _all: true },
      }),

      // 7. Total outstanding balance (as of now, invoiceDate in period)
      this.prisma.invoice.aggregate({
        where: {
          businessId,
          status: { notIn: [InvoiceStatus.Cancelled, InvoiceStatus.Draft] },
          balanceDue: { gt: 0 },
          ...invoiceDatePeriod,
        },
        _sum: { balanceDue: true },
      }),

      // 8. Partially-paid invoices
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: InvoiceStatus.PartiallyPaid,
          ...invoiceDatePeriod,
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          amountPaid: true,
          balanceDue: true,
          invoiceDate: true,
          promisedPaymentDate: true,
          customer: { select: { customerName: true, shopName: true } },
        },
        orderBy: { balanceDue: 'desc' },
        take: 20,
      }),

      // 9. Promised payments within next 14 days (forward-looking)
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: { notIn: [InvoiceStatus.Cancelled, InvoiceStatus.Paid] },
          balanceDue: { gt: 0 },
          promisedPaymentDate: { lte: in14Days, not: null },
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          balanceDue: true,
          promisedPaymentDate: true,
          status: true,
          customer: { select: { customerName: true, shopName: true } },
        },
        orderBy: { promisedPaymentDate: 'asc' },
        take: 20,
      }),

      // 10. Revenue chart
      this.revenueChart(businessId, periodStart, periodEnd, isAllTime, bucketType),
    ]);

    // Build per-salesperson conversion stats from the grouped rows
    const salespersonStats = await this.buildConversionStats(conversionRows);

    return {
      monthlyRevenue,
      activeDeals,
      totalCustomers,
      overdueInvoices: overdueRows.map(flattenCustomer),
      expiringSubscriptions: expiringRows.map((s) =>
        withDaysUntilExpiry(flattenSub(s), now),
      ),
      salespersonStats,
      revenueByMonth,
      totalOutstandingBalance: Number(outstandingAgg._sum.balanceDue ?? 0),
      partiallyPaidInvoices: partiallyPaidRows.map(flattenCustomer),
      promisedPaymentsDue: promisedRows.map(flattenCustomer),
      resolvedFrom: periodStart.toISOString(),
      resolvedTo: periodEnd.toISOString(),
      isAllTime,
      bucketType,
    };
  }

  private async buildConversionStats(
    rows: Array<{
      assignedToId: string;
      stage: CustomerStage;
      _count: { _all: number };
    }>,
  ) {
    const byUser = new Map<
      string,
      { total: number; closedWon: number; closedLost: number }
    >();
    for (const r of rows) {
      const entry =
        byUser.get(r.assignedToId) ?? { total: 0, closedWon: 0, closedLost: 0 };
      entry.total += r._count._all;
      if (r.stage === CustomerStage.ClosedWon) entry.closedWon += r._count._all;
      if (r.stage === CustomerStage.ClosedLost) entry.closedLost += r._count._all;
      byUser.set(r.assignedToId, entry);
    }

    const userIds = [...byUser.keys()];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, fullName: true, email: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return [...byUser.entries()]
      .map(([userId, s]) => {
        const u = userMap.get(userId);
        return {
          userId,
          name: u?.fullName || u?.email || '',
          total: s.total,
          closedWon: s.closedWon,
          closedLost: s.closedLost,
          conversionRate:
            s.total === 0 ? 0 : (s.closedWon / s.total) * 100,
        };
      })
      .sort((a, b) => b.conversionRate - a.conversionRate);
  }

  async salespersonStats(user: RequestUser, from?: string, to?: string) {
    const businessId = user.businessId;
    const assignedToId = user.userId;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 86_400_000);
    const in30Days = new Date(now.getTime() + 30 * 86_400_000);

    const { periodStart, periodEnd, isAllTime } = resolvePeriod(from, to);
    const bucketType = getBucketType(periodStart, periodEnd, isAllTime);

    const customerPeriod: Prisma.CustomerWhereInput = isAllTime
      ? {}
      : { createdAt: { gte: periodStart, lte: periodEnd } };
    const invoiceDatePeriod: Prisma.InvoiceWhereInput = isAllTime
      ? {}
      : { invoiceDate: { gte: periodStart, lte: periodEnd } };

    const [
      myCustomers,
      kpiGroups,
      totalRevenue,
      pipelineGroups,
      dueFollowUps,
      openInvoicesList,
      expiringSubsList,
      myRevenueByMonth,
    ] = await Promise.all([
      // 1. Total customers (always current)
      this.prisma.customer.count({ where: { businessId, assignedToId } }),

      // 2. KPI stage counts for the period
      this.prisma.customer.groupBy({
        by: ['stage'],
        where: { businessId, assignedToId, ...customerPeriod },
        _count: { _all: true },
      }),

      // Revenue in period from my customers' invoices
      this.revenueTotal(businessId, periodStart, periodEnd, isAllTime, assignedToId),

      // 3. Pipeline breakdown (open deals only, current)
      this.prisma.customer.groupBy({
        by: ['stage'],
        where: { businessId, assignedToId, isClosed: false },
        _count: { _all: true },
        orderBy: { stage: 'asc' },
      }),

      // 4. Due follow-ups (as of now)
      this.prisma.customer.findMany({
        where: {
          businessId,
          assignedToId,
          isClosed: false,
          nextFollowUpAt: { lte: now, not: null },
        },
        select: {
          id: true,
          customerName: true,
          shopName: true,
          stage: true,
          status: true,
          note: true,
          nextFollowUpAt: true,
        },
        orderBy: { nextFollowUpAt: 'asc' },
        take: 20,
      }),

      // 5. Open invoices (Sent + Overdue + Partially Paid), invoiceDate filtered to period
      this.prisma.invoice.findMany({
        where: {
          businessId,
          status: {
            in: [InvoiceStatus.Sent, InvoiceStatus.Overdue, InvoiceStatus.PartiallyPaid],
          },
          customer: { assignedToId },
          ...invoiceDatePeriod,
        },
        select: {
          id: true,
          invoiceNumber: true,
          total: true,
          balanceDue: true,
          status: true,
          invoiceDate: true,
          nextReminderAt: true,
          customer: { select: { customerName: true, shopName: true } },
        },
        orderBy: { invoiceDate: 'asc' },
        take: 20,
      }),

      // 6. Expiring subscriptions in 30 days (forward-looking)
      this.prisma.subscription.findMany({
        where: {
          businessId,
          status: { in: [SubscriptionStatus.Active, SubscriptionStatus.Renewed] },
          expiryDate: { gte: now, lte: in30Days },
          customer: { assignedToId },
        },
        select: {
          id: true,
          expiryDate: true,
          status: true,
          servicePrice: true,
          customer: { select: { customerName: true, shopName: true } },
          service: { select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: 20,
      }),

      // 7. Revenue chart for this salesperson
      this.revenueChart(
        businessId,
        periodStart,
        periodEnd,
        isAllTime,
        bucketType,
        assignedToId,
      ),
    ]);

    // Reduce KPI stage groups
    let kpiTotal = 0;
    let closedWon = 0;
    let closedLost = 0;
    for (const g of kpiGroups) {
      kpiTotal += g._count._all;
      if (g.stage === CustomerStage.ClosedWon) closedWon += g._count._all;
      if (g.stage === CustomerStage.ClosedLost) closedLost += g._count._all;
    }
    const conversionRate =
      kpiTotal > 0 ? Math.round((closedWon / kpiTotal) * 100) : 0;

    const followUpsToday = dueFollowUps.filter((c) => {
      if (!c.nextFollowUpAt) return false;
      const d = new Date(c.nextFollowUpAt);
      return d >= todayStart && d < todayEnd;
    }).length;

    const pipelineBreakdown = pipelineGroups.map((g) => ({
      _id: g.stage,
      count: g._count._all,
    }));

    return {
      myCustomers,
      followUpsToday,
      openInvoices: openInvoicesList.length,
      renewalsDueSoon: expiringSubsList.length,
      kpis: {
        totalCustomers: kpiTotal,
        closedWon,
        closedLost,
        conversionRate,
        totalRevenue,
      },
      pipelineBreakdown,
      dueFollowUps,
      openInvoicesList: openInvoicesList.map(flattenCustomer),
      expiringSubsList: expiringSubsList.map((s) =>
        withDaysUntilExpiry(flattenSub(s), now),
      ),
      myRevenueByMonth,
      resolvedFrom: periodStart.toISOString(),
      resolvedTo: periodEnd.toISOString(),
      isAllTime,
      bucketType,
    };
  }
}

// ── Row flatteners (lift nested customer/service onto the top-level shape) ──────

function flattenCustomer<
  T extends { customer?: { customerName?: string; shopName?: string } | null },
>(row: T): Omit<T, 'customer'> & { customerName: string; shopName: string } {
  const { customer, ...rest } = row;
  return {
    ...(rest as Omit<T, 'customer'>),
    customerName: customer?.customerName ?? '',
    shopName: customer?.shopName ?? '',
  };
}

function flattenSub<
  T extends {
    customer?: { customerName?: string; shopName?: string } | null;
    service?: { name?: string } | null;
  },
>(row: T) {
  const { customer, service, ...rest } = row;
  return {
    ...(rest as Omit<T, 'customer' | 'service'>),
    customerName: customer?.customerName ?? '',
    shopName: customer?.shopName ?? '',
    serviceName: service?.name ?? '',
  };
}

function withDaysUntilExpiry<T extends { expiryDate: Date }>(row: T, now: Date) {
  return {
    ...row,
    daysUntilExpiry:
      (row.expiryDate.getTime() - now.getTime()) / 86_400_000,
  };
}
