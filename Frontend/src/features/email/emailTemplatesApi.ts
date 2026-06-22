import api from '../../lib/api';

export type TemplateType =
  | 'welcome'
  | 'followup'
  | 'invoice_reminder'
  | 'renewal'
  | 'thank_you'
  | 'custom';

export interface EmailTemplate {
  id: string;
  businessId: string;
  name: string;
  type: TemplateType;
  subject: string;
  bodyHtml: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplatePayload {
  name: string;
  type: TemplateType;
  subject: string;
  bodyHtml: string;
}

export const TEMPLATE_TYPE_LABELS: Record<TemplateType, string> = {
  welcome:          'Welcome',
  followup:         'Follow-up',
  invoice_reminder: 'Invoice Reminder',
  renewal:          'Renewal',
  thank_you:        'Thank You',
  custom:           'Custom',
};

export const TEMPLATE_TYPES: TemplateType[] = [
  'welcome',
  'followup',
  'invoice_reminder',
  'renewal',
  'thank_you',
  'custom',
];

export const VARIABLES = [
  { token: '{customer_name}',  label: 'Customer Name' },
  { token: '{shop_name}',      label: 'Shop Name' },
  { token: '{salesperson_name}', label: 'Salesperson Name' },
  { token: '{invoice_amount}', label: 'Invoice Amount' },
  { token: '{service_name}',   label: 'Service Name' },
  { token: '{expiry_date}',    label: 'Expiry Date' },
] as const;

export type VariableToken = typeof VARIABLES[number]['token'];

export const emailTemplatesApi = {
  list: (): Promise<EmailTemplate[]> =>
    api
      .get<{ data: EmailTemplate[] }>('/email/templates')
      .then((r) => r.data.data),

  get: (id: string): Promise<EmailTemplate> =>
    api
      .get<{ data: EmailTemplate }>(`/email/templates/${id}`)
      .then((r) => r.data.data),

  create: (payload: TemplatePayload): Promise<EmailTemplate> =>
    api
      .post<{ data: EmailTemplate }>('/email/templates', payload)
      .then((r) => r.data.data),

  update: (id: string, payload: Partial<TemplatePayload>): Promise<EmailTemplate> =>
    api
      .patch<{ data: EmailTemplate }>(`/email/templates/${id}`, payload)
      .then((r) => r.data.data),

  remove: (id: string): Promise<void> =>
    api.delete(`/email/templates/${id}`).then(() => undefined),
};
