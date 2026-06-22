import api from '../../lib/api';
import { PIPELINE_STAGES } from '../customers/customersApi';

export { PIPELINE_STAGES };

/** Mirror of the backend SegmentFilter interface */
export interface SegmentFilter {
  salespersonId?: string;   // owner-only
  stage?: string;
  status?: string;

  // Subscription customers
  hasActiveSubscription?: boolean;
  subscriptionServiceId?: string;
  subscriptionExpiringDays?: number;

  // Unpaid-invoice customers
  unpaidInvoiceOnly?: boolean;
  unpaidOverdueDays?: number;

  /** @deprecated use unpaidInvoiceOnly + unpaidOverdueDays */
  invoiceOverdueDays?: number;
}

export interface DailyCap {
  remaining: number;
  used: number;
  cap: number;
}

export interface SendResult {
  campaignId: string;
  sent?: number;
  deferred?: number;
  scheduledAt?: string;
  recipientCount?: number;
}

export interface SendResponse {
  data: SendResult;
  message: string;
}

/** A campaign document as returned by GET /email/campaigns */
export interface Campaign {
  id: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'partially_sent';
  sentCount: number;
  scheduledAt: string | null;
  createdAt: string;
  segment?: Record<string, unknown>;
}

/** Aggregate stats for a single campaign */
export interface CampaignStats {
  campaignId: string;
  subject: string;
  status: string;
  sentCount: number;
  total: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  failed: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  createdAt: string;
}

/** One row from GET /email/history/:customerId */
export interface EmailLogEntry {
  id: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed';
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
  createdAt: string;
  campaign?: {
    id?: string;
    subject: string;
    templateId?: string;
    status: string;
    createdAt: string;
  } | null;
}

/** Accepted MIME types (must match backend allowlist) */
export const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
] as const;

export const MAX_ATTACHMENT_SIZE_MB = 10;
export const MAX_ATTACHMENTS = 5;
export const DAILY_CAP = 100;

export const emailCampaignApi = {
  /** Remaining free-tier quota for today */
  getDailyCap: (): Promise<DailyCap> =>
    api
      .get<{ data: DailyCap }>('/email/daily-cap')
      .then((r) => r.data.data),

  send: (formData: FormData): Promise<SendResponse> =>
    api
      .post<SendResponse>('/email/send', formData, {
        headers: { 'Content-Type': undefined },
      })
      .then((r) => r.data),

  listCampaigns: (): Promise<Campaign[]> =>
    api.get<{ data: Campaign[] }>('/email/campaigns').then((r) => r.data.data),

  getCampaignStats: (id: string): Promise<CampaignStats> =>
    api
      .get<{ data: CampaignStats }>(`/email/campaigns/${id}/stats`)
      .then((r) => r.data.data),

  getCustomerHistory: (customerId: string): Promise<EmailLogEntry[]> =>
    api
      .get<{ data: EmailLogEntry[] }>(`/email/history/${customerId}`)
      .then((r) => r.data.data),

  getSegmentCount: (segment: SegmentFilter): Promise<number> =>
    api
      .get<{ data: { count: number } }>('/email/segment/count', {
        params: { segment: JSON.stringify(segment) },
      })
      .then((r) => r.data.data.count),
};
