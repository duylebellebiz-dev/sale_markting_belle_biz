import api from '../../lib/api';

export type NotificationType = 'followup' | 'invoice' | 'renewal';

export interface AppNotification {
  id: string;
  businessId: string;
  targetUserId: string;
  type: NotificationType;
  message: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationsPage {
  data: AppNotification[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

const d = <T>(res: { data: T }) => res.data;

export const notificationsApi = {
  list: (page = 1, limit = 20) =>
    api
      .get<NotificationsPage>('/notifications', { params: { page, limit } })
      .then(d<NotificationsPage>),

  unreadCount: () =>
    api.get<{ unread: number }>('/notifications/unread-count').then(d<{ unread: number }>),

  markRead: (id: string) =>
    api.patch<AppNotification>(`/notifications/${id}/read`).then(d<AppNotification>),

  markAllRead: () =>
    api.patch<{ updated: number }>('/notifications/read-all').then(d<{ updated: number }>),

  deleteOne: (id: string) =>
    api.delete<{ deleted: number }>(`/notifications/${id}`).then(d<{ deleted: number }>),

  deleteAll: () =>
    api.delete<{ deleted: number }>('/notifications/delete-all').then(d<{ deleted: number }>),
};
