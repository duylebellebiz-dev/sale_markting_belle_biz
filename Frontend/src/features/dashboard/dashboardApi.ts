import api from '../../lib/api';

export type BucketType = 'daily' | 'weekly' | 'monthly';

/** Shape returned by the Prisma dashboard service (DATE_TRUNC bucketing) */
export interface RevenueBucket {
  bucket: string; // ISO datetime string from DATE_TRUNC
  revenue: number;
}

export type RevenueMonth = RevenueBucket;

export interface OverdueInvoice {
  id: string;
  invoiceNumber: string;
  total?: number;
  amount?: number;
  balanceDue?: number;
  invoiceDate?: string;
  dateSent?: string;
  nextReminderAt?: string;
  customerName?: string;
  shopName?: string;
}

export interface ExpiringSubscription {
  id: string;
  customerName?: string;
  shopName?: string;
  serviceName?: string;
  expiryDate: string;
  daysUntilExpiry: number;
  status: string;
  servicePrice: number;
}

export interface SalespersonStat {
  userId: string;
  name: string;
  total: number;
  closedWon: number;
  closedLost: number;
  conversionRate: number;
}

export interface PartiallyPaidInvoice {
  id: string;
  invoiceNumber: string;
  total: number;
  amountPaid: number;
  balanceDue: number;
  invoiceDate?: string;
  promisedPaymentDate?: string;
  customerName?: string;
  shopName?: string;
}

export interface PromisedPaymentDue {
  id: string;
  invoiceNumber: string;
  total: number;
  balanceDue: number;
  promisedPaymentDate: string;
  status: string;
  customerName?: string;
  shopName?: string;
}

export interface PeriodMeta {
  resolvedFrom: string;
  resolvedTo: string;
  isAllTime: boolean;
  bucketType: BucketType;
}

export interface OwnerDashboardData extends PeriodMeta {
  monthlyRevenue: number;
  activeDeals: number;
  totalCustomers: number;
  overdueInvoices: OverdueInvoice[];
  expiringSubscriptions: ExpiringSubscription[];
  salespersonStats: SalespersonStat[];
  revenueByMonth: RevenueBucket[];
  totalOutstandingBalance: number;
  partiallyPaidInvoices: PartiallyPaidInvoice[];
  promisedPaymentsDue: PromisedPaymentDue[];
}

export interface DueFollowUp {
  id: string;
  customerName: string;
  shopName?: string;
  stage: string;
  status?: string;
  note?: string;
  nextFollowUpAt: string;
}

export interface OpenInvoiceTask {
  id: string;
  invoiceNumber: string;
  total?: number;
  amount?: number;
  balanceDue?: number;
  status: 'Sent' | 'Overdue' | 'Partially Paid';
  invoiceDate?: string;
  dateSent?: string;
  nextReminderAt?: string;
  customerName?: string;
  shopName?: string;
}

export interface SalespersonKpis {
  totalCustomers: number;
  closedWon: number;
  closedLost: number;
  conversionRate: number;
  totalRevenue: number;
}

/** Pipeline breakdown — _id is the stage name (set intentionally by the backend) */
export interface PipelineSlice {
  _id: string;
  count: number;
}

export interface SalespersonDashboardData extends PeriodMeta {
  myCustomers: number;
  followUpsToday: number;
  openInvoices: number;
  renewalsDueSoon: number;
  kpis: SalespersonKpis;
  pipelineBreakdown: PipelineSlice[];
  dueFollowUps: DueFollowUp[];
  openInvoicesList: OpenInvoiceTask[];
  expiringSubsList: ExpiringSubscription[];
  myRevenueByMonth: RevenueBucket[];
}

const d = <T>(res: { data: T }) => res.data;

function periodParams(from?: string, to?: string): string {
  if (!from) return '';
  const params = new URLSearchParams();
  params.set('from', from);
  if (to) params.set('to', to);
  return `?${params.toString()}`;
}

export const dashboardApi = {
  owner: (from?: string, to?: string) =>
    api.get<OwnerDashboardData>(`/dashboard/owner${periodParams(from, to)}`).then(d<OwnerDashboardData>),
  salesperson: (from?: string, to?: string) =>
    api.get<SalespersonDashboardData>(`/dashboard/salesperson${periodParams(from, to)}`).then(d<SalespersonDashboardData>),
};
