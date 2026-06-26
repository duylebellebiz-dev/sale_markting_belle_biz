import api from '../../lib/api';

export type ThreadItem =
  | {
      kind: 'outbound_log';
      id: string;
      subject: string;
      status: string;
      sentAt: string | null;
      createdAt: string;
    }
  | {
      kind: 'message';
      id: string;
      direction: 'outbound' | 'inbound';
      from: string;
      to: string;
      subject: string;
      bodyHtml: string;
      bodyText: string;
      at: string;
    };

export interface UnmatchedMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: string | null;
  createdAt: string;
}

export const emailThreadsApi = {
  getThread: (customerId: string): Promise<ThreadItem[]> =>
    api.get<{ data: ThreadItem[] }>(`/email/threads/${customerId}`).then((r) => r.data.data),

  reply: (customerId: string, subject: string, bodyHtml: string) =>
    api
      .post<{ data: unknown; message: string }>(`/email/threads/${customerId}/reply`, { subject, bodyHtml })
      .then((r) => r.data),

  listUnmatched: (): Promise<UnmatchedMessage[]> =>
    api.get<{ data: UnmatchedMessage[] }>('/email/threads/unmatched').then((r) => r.data.data),

  linkUnmatched: (messageId: string, customerId: string) =>
    api
      .patch<{ data: unknown; message: string }>(`/email/threads/unmatched/${messageId}/link`, { customerId })
      .then((r) => r.data),
};
