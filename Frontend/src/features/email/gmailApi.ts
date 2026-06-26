import api from '../../lib/api';

export interface GmailStatus {
  status: 'connected' | 'disconnected' | 'error';
  emailAddress?: string;
  createdAt?: string;
  updatedAt?: string;
}

const d = <T>(res: { data: T }) => res.data;

export const gmailApi = {
  getStatus: () => api.get<GmailStatus>('/email/gmail/status').then(d<GmailStatus>),

  getConnectUrl: () =>
    api.get<{ authUrl: string }>('/email/gmail/connect').then(d<{ authUrl: string }>),

  disconnect: () =>
    api.delete<{ message: string }>('/email/gmail/disconnect').then(d<{ message: string }>),
};
