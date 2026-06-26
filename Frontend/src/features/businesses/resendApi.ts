import api from '../../lib/api';

export interface ResendSettings {
  configured: boolean;
  fromEmail: string;
  fromName: string;
}

export interface UpdateResendSettingsPayload {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const resendApi = {
  getSettings: () => api.get<ResendSettings>('/businesses/settings/email').then(d<ResendSettings>),

  setSettings: (payload: UpdateResendSettingsPayload) =>
    api
      .patch<{ data: ResendSettings; message: string }>('/businesses/settings/email', payload)
      .then(d<{ data: ResendSettings; message: string }>),

  clearSettings: () =>
    api
      .delete<{ data: ResendSettings; message: string }>('/businesses/settings/email')
      .then(d<{ data: ResendSettings; message: string }>),
};
