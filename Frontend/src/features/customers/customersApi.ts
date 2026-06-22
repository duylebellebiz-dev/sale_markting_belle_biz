import api from '../../lib/api';

export const PIPELINE_STAGES = [
  'Lead',
  'Contacted',
  'Interested',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface Customer {
  id: string;
  customerName: string;
  shopName?: string;
  shopAddress?: string;
  email?: string;
  phoneNumber?: string;
  shopPhoneNumber?: string;
  contactSource?: string;
  dateOfContact?: string;
  stage: PipelineStage;
  status?: string;
  note?: string;
  nextFollowUpAt?: string;
  isClosed: boolean;
  assignedTo: { id: string; fullName: string; email: string } | string;
  businessId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerPayload {
  customerName: string;
  assignedTo?: string;
  shopName?: string;
  shopAddress?: string;
  email?: string;
  phoneNumber?: string;
  shopPhoneNumber?: string;
  contactSource?: string;
  dateOfContact?: string;
  stage?: PipelineStage;
  status?: string;
  note?: string;
  nextFollowUpAt?: string;
}

export interface StaffUser {
  id: string;
  fullName: string;
  email: string;
}

const d = <T>(res: { data: T }) => res.data;

export const customersApi = {
  list: () => api.get<Customer[]>('/customers').then(d<Customer[]>),

  get: (id: string) => api.get<Customer>(`/customers/${id}`).then(d<Customer>),

  create: (payload: CustomerPayload) =>
    api.post<Customer>('/customers', payload).then(d<Customer>),

  update: (id: string, payload: Partial<CustomerPayload>) =>
    api.patch<Customer>(`/customers/${id}`, payload).then(d<Customer>),

  remove: (id: string) => api.delete(`/customers/${id}`),

  reschedule: (id: string, nextFollowUpAt: string, note?: string) =>
    api
      .post<Customer>(`/customers/${id}/reschedule`, { nextFollowUpAt, note })
      .then(d<Customer>),

  closeLost: (id: string, note?: string) =>
    api.post<Customer>(`/customers/${id}/close-lost`, { note }).then(d<Customer>),

  listStaff: () => api.get<StaffUser[]>('/users').then(d<StaffUser[]>),

  /** Lightweight search — returns name/shopName/email/isClosed only. */
  search: (q: string, limit = 20): Promise<Pick<Customer, 'id' | 'customerName' | 'shopName' | 'email' | 'isClosed'>[]> =>
    api
      .get<Pick<Customer, 'id' | 'customerName' | 'shopName' | 'email' | 'isClosed'>[]>(
        '/customers/search',
        { params: { q, limit } },
      )
      .then(d<Pick<Customer, 'id' | 'customerName' | 'shopName' | 'email' | 'isClosed'>[]>),
};
