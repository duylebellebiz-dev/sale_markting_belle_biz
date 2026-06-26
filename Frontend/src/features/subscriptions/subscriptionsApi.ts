import api from '../../lib/api';

export type SubscriptionStatus = 'Active' | 'Renewed' | 'Cancelled' | 'Expired';

export interface SubCustomer {
  id: string;
  customerName: string;
  shopName?: string;
  assignedTo?: string | { id: string; fullName: string; email: string };
}

export interface SubService {
  id: string;
  name: string;
}

export interface SubInvoice {
  id: string;
  invoiceNumber: string;
  total?: number;
  amount?: number;
  status: string;
}

export interface Subscription {
  id: string;
  businessId: string;
  customerId: SubCustomer | string;
  serviceId: SubService | string;
  invoiceId?: SubInvoice | string;
  servicePrice: number;
  closingDate?: string;
  startDate?: string;
  expiryDate: string;
  status: SubscriptionStatus;
  nextReminderAt?: string;
  reminderStep: number;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSubscriptionPayload {
  customerId: string;
  serviceId: string;
  invoiceId?: string;
  createInvoice?: boolean;
  closingDate?: string;
  startDate?: string;
  expiryDate: string;
  servicePrice?: number;
  note?: string;
}

export interface RenewPayload {
  expiryDate: string;
  startDate?: string;
  invoiceId?: string;
  createInvoice?: boolean;
  servicePrice?: number;
  note?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const subscriptionsApi = {
  list: () => api.get<Subscription[]>('/subscriptions').then(d<Subscription[]>),
  get: (id: string) => api.get<Subscription>(`/subscriptions/${id}`).then(d<Subscription>),
  create: (payload: CreateSubscriptionPayload) =>
    api.post<Subscription>('/subscriptions', payload).then(d<Subscription>),
  renew: (id: string, payload: RenewPayload) =>
    api.post<Subscription>(`/subscriptions/${id}/renew`, payload).then(d<Subscription>),
  cancel: (id: string) =>
    api.post<Subscription>(`/subscriptions/${id}/cancel`).then(d<Subscription>),
};
