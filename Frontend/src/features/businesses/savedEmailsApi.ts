import api from '../../lib/api';

const d = <T>(res: { data: T }) => res.data;

export const savedEmailsApi = {
  // Readable by any authenticated staff member — used as quick-pick chips when composing email.
  list: () => api.get<string[]>('/businesses/settings/saved-emails').then(d<string[]>),

  // Owner-only — replaces the full saved list.
  update: (emails: string[]) =>
    api.patch<string[]>('/businesses/settings/saved-emails', { emails }).then(d<string[]>),
};
