import api from '../../lib/api';

export type InvoiceStatus = 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Cancelled';

export interface LineItem {
  serviceId?: string;
  description: string;
  serviceTerm?: string;
  quantity: number;
  rate: number;
  amount: number; // server-computed
}

export interface BillTo {
  name: string;
  addressLine: string;
  email: string;
  phone: string;
}

export interface PaymentEntry {
  id: string;
  date: string;
  amount: number;
  method?: string;
  note?: string;
}

export interface InvoiceCustomer {
  id: string;
  customerName: string;
  shopName?: string;
  assignedTo?: string | { id: string; fullName: string; email: string };
}

export interface Invoice {
  id: string;
  businessId: string;
  customerId: InvoiceCustomer | string;
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string;
  terms?: string;
  billTo: BillTo;
  lineItems: LineItem[];
  subTotal: number;
  discount: number;
  shippingCharges: number;
  adjustment: number;
  taxRate: number;
  province?: string;
  taxLabel?: string;
  taxAmount: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  customerNote?: string;
  termsConditions?: string;
  status: InvoiceStatus;
  nextReminderAt?: string;
  reminderStep: number;
  promisedPaymentDate?: string;
  payments: PaymentEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface LineItemPayload {
  serviceId?: string;
  description: string;
  serviceTerm?: string;
  quantity: number;
  rate: number;
}

export interface CreateInvoicePayload {
  customerId: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  terms?: string;
  lineItems: LineItemPayload[];
  discount?: number;
  shippingCharges?: number;
  adjustment?: number;
  taxRate?: number;
  province?: string;
  taxLabel?: string;
  customerNote?: string;
  termsConditions?: string;
}

export interface UpdateInvoicePayload {
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  terms?: string;
  lineItems?: LineItemPayload[];
  discount?: number;
  shippingCharges?: number;
  adjustment?: number;
  taxRate?: number;
  province?: string;
  taxLabel?: string;
  customerNote?: string;
  termsConditions?: string;
}

export interface AddPaymentPayload {
  amount: number;
  date?: string;
  method?: string;
  note?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const invoicesApi = {
  nextNumber: () => api.get<string>('/invoices/next-number').then(d<string>),

  list: () => api.get<Invoice[]>('/invoices').then(d<Invoice[]>),

  byCustomer: (customerId: string) =>
    api.get<Invoice[]>(`/invoices/by-customer/${customerId}`).then(d<Invoice[]>),

  get: (id: string) => api.get<Invoice>(`/invoices/${id}`).then(d<Invoice>),

  create: (payload: CreateInvoicePayload) =>
    api.post<Invoice>('/invoices', payload).then(d<Invoice>),

  update: (id: string, payload: UpdateInvoicePayload) =>
    api.patch<Invoice>(`/invoices/${id}`, payload).then(d<Invoice>),

  remove: (id: string) => api.delete(`/invoices/${id}`),

  markSent: (id: string) =>
    api.post<Invoice>(`/invoices/${id}/send`).then(d<Invoice>),

  markPaid: (id: string, payload: AddPaymentPayload) =>
    api.post<Invoice>(`/invoices/${id}/mark-paid`, payload).then(d<Invoice>),

  markUnpaid: (id: string) =>
    api.post<Invoice>(`/invoices/${id}/mark-unpaid`).then(d<Invoice>),

  cancel: (id: string) =>
    api.post<Invoice>(`/invoices/${id}/cancel`).then(d<Invoice>),

  addPayment: (id: string, payload: AddPaymentPayload) =>
    api.post<Invoice>(`/invoices/${id}/payments`, payload).then(d<Invoice>),

  removePayment: (id: string, paymentId: string) =>
    api.delete<Invoice>(`/invoices/${id}/payments/${paymentId}`).then(d<Invoice>),

  updatePromisedDate: (id: string, promisedPaymentDate?: string) =>
    api.patch<Invoice>(`/invoices/${id}/promised-date`, { promisedPaymentDate }).then(d<Invoice>),

  sendEmail: (
    id: string,
    payload: { templateId?: string; customSubject?: string; customBodyHtml?: string } = {},
  ) =>
    api.post<{ message: string }>(`/invoices/${id}/send-email`, payload).then(d<{ message: string }>),

  downloadPdf: async (id: string, invoiceNumber: string) => {
    const res = await api.get<Blob>(`/invoices/${id}/pdf`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice-${invoiceNumber}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};
