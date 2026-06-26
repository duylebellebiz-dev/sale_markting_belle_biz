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
