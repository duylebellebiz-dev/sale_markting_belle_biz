import api from '../../lib/api';

export interface BusinessBranding {
  _id: string;
  businessName: string;
  email: string;
  logoUrl?: string;
  addressLine?: string;
  country?: string;
  phone?: string;
  website?: string;
  gstNumber?: string;
  pstNumber?: string;
  defaultTaxRate?: number;
  defaultCustomerNote?: string;
  defaultTerms?: string;
  province?: string;
  currentInvoiceNumber?: string;
}

export interface UpdateBrandingPayload {
  businessName?: string;
  addressLine?: string;
  country?: string;
  phone?: string;
  website?: string;
  gstNumber?: string;
  pstNumber?: string;
  defaultTaxRate?: number;
  defaultCustomerNote?: string;
  defaultTerms?: string;
  province?: string;
  currentInvoiceNumber?: string;
}

export interface SmtpSettings {
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpFromName: string;
  configured: boolean;
}

export interface UpdateSmtpSettingsPayload {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const businessesApi = {
  getBranding: () =>
    api.get<BusinessBranding>('/businesses/branding').then(d<BusinessBranding>),

  updateBranding: (payload: UpdateBrandingPayload) =>
    api.patch<BusinessBranding>('/businesses/branding', payload).then(d<BusinessBranding>),

  getClaudeKeyStatus: () =>
    api.get<{ configured: boolean }>('/businesses/settings/claude-api-key').then(d<{ configured: boolean }>),

  setClaudeApiKey: (apiKey: string) =>
    api.patch<{ message: string }>('/businesses/settings/claude-api-key', { apiKey }).then(d<{ message: string }>),

  getSmtpSettings: () =>
    api.get<SmtpSettings>('/businesses/settings/email').then(d<SmtpSettings>),

  setSmtpSettings: (payload: UpdateSmtpSettingsPayload) =>
    api
      .patch<{ data: SmtpSettings; message: string }>('/businesses/settings/email', payload)
      .then(d<{ data: SmtpSettings; message: string }>),

  clearSmtpSettings: () =>
    api
      .delete<{ data: SmtpSettings; message: string }>('/businesses/settings/email')
      .then(d<{ data: SmtpSettings; message: string }>),

  uploadLogo: (file: File) => {
    const form = new FormData();
    form.append('logo', file);
    return api
      .post<{ data: BusinessBranding; message: string }>('/businesses/branding/logo', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(d<{ data: BusinessBranding; message: string }>)
      .then((res) => res.data);
  },
};
