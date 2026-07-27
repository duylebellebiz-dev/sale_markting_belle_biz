import api from '../../lib/api';

export interface MailgunSettings {
  configured: boolean;
  domain: string;
  fromEmail: string;
  fromName: string;
}

export interface UpdateMailgunSettingsPayload {
  apiKey: string;
  domain: string;
  fromEmail: string;
  fromName?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const mailgunApi = {
  getSettings: () => api.get<MailgunSettings>('/businesses/settings/email').then(d<MailgunSettings>),

  setSettings: (payload: UpdateMailgunSettingsPayload) =>
    api
      .patch<{ data: MailgunSettings; message: string }>('/businesses/settings/email', payload)
      .then(d<{ data: MailgunSettings; message: string }>),

  clearSettings: () =>
    api
      .delete<{ data: MailgunSettings; message: string }>('/businesses/settings/email')
      .then(d<{ data: MailgunSettings; message: string }>),
};
