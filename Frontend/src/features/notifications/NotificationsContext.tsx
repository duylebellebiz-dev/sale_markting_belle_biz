/**
 * Global notifications state shared between the bell dropdown (Topbar) and
 * the full NotificationsPage. Polls the unread count every 60 s so the badge
 * stays fresh without a WebSocket.
 *
 * Pagination / infinite scroll:
 *   - `notifications` accumulates pages as the user scrolls.
 *   - `loadMore()` fetches the next page and appends.
 *   - `reload()` resets to page 1 (used after delete-all / trigger scan).
 *   - The badge only needs `unreadCount` which comes from a cheap separate endpoint.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { notificationsApi, type AppNotification } from './notificationsApi';
import { useAuth } from '../../context/AuthContext';

const PAGE_SIZE = 20;

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;      // true only on initial page-1 load
  loadingMore: boolean;  // true while fetching page 2+
  hasMore: boolean;
  error: string | null;
}

interface NotificationsContextValue extends NotificationsState {
  reload: () => Promise<void>;
  loadMore: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteOne: (id: string) => Promise<void>;
  deleteAll: () => Promise<void>;
}

const Ctx = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    loading: false,
    loadingMore: false,
    hasMore: false,
    error: null,
  });
  const pageRef = useRef(1);          // current highest loaded page
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Fetch page 1 and replace current list */
  const reload = useCallback(async () => {
    if (!user) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await notificationsApi.list(1, PAGE_SIZE);
      pageRef.current = 1;
      setState({
        notifications: res.data,
        unreadCount: res.data.filter((n) => !n.isRead).length,
        loading: false,
        loadingMore: false,
        hasMore: res.hasMore,
        error: null,
      });
    } catch {
      setState((s) => ({ ...s, loading: false, error: 'Failed to load notifications.' }));
    }
  }, [user]);

  /** Append next page - called by IntersectionObserver sentinel in NotificationsPage */
  const loadMore = useCallback(async () => {
    if (!user) return;
    setState((s) => {
      if (!s.hasMore || s.loadingMore) return s;  // nothing to do
      return { ...s, loadingMore: true };
    });
    try {
      const nextPage = pageRef.current + 1;
      const res = await notificationsApi.list(nextPage, PAGE_SIZE);
      pageRef.current = nextPage;
      setState((s) => ({
        ...s,
        notifications: [...s.notifications, ...res.data],
        unreadCount: [...s.notifications, ...res.data].filter((n) => !n.isRead).length,
        loadingMore: false,
        hasMore: res.hasMore,
      }));
    } catch {
      setState((s) => ({ ...s, loadingMore: false }));
    }
  }, [user]);

  // Initial load + 60-second poll for badge freshness
  useEffect(() => {
    if (!user) return;
    reload();
    pollRef.current = setInterval(async () => {
      try {
        const { unread } = await notificationsApi.unreadCount();
        setState((s) => {
          if (unread !== s.unreadCount) {
            // New notifications arrived - silently refresh page 1 and prepend any new items
            notificationsApi.list(1, PAGE_SIZE).then((res) => {
              setState((prev) => {
                const existingIds = new Set(prev.notifications.map((n) => n.id));
                const newItems = res.data.filter((n) => !existingIds.has(n.id));
                if (newItems.length === 0) {
                  // No new items, just update count
                  return { ...prev, unreadCount: unread };
                }
                const merged = [...newItems, ...prev.notifications];
                return {
                  ...prev,
                  notifications: merged,
                  unreadCount: merged.filter((n) => !n.isRead).length,
                };
              });
            }).catch(() => {/* ignore */});
            return s;
          }
          return s;
        });
      } catch {
        // Silently ignore poll errors
      }
    }, 60_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, reload]);

  const markRead = useCallback(async (id: string) => {
    await notificationsApi.markRead(id);
    setState((s) => {
      const notifications = s.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n,
      );
      return { ...s, notifications, unreadCount: Math.max(0, s.unreadCount - 1) };
    });
  }, []);

  const markAllRead = useCallback(async () => {
    await notificationsApi.markAllRead();
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    }));
  }, []);

  const deleteOne = useCallback(async (id: string) => {
    await notificationsApi.deleteOne(id);
    setState((s) => {
      const notifications = s.notifications.filter((n) => n.id !== id);
      const unreadCount = notifications.filter((n) => !n.isRead).length;
      return { ...s, notifications, unreadCount };
    });
  }, []);

  const deleteAll = useCallback(async () => {
    await notificationsApi.deleteAll();
    pageRef.current = 1;
    setState((s) => ({ ...s, notifications: [], unreadCount: 0, hasMore: false }));
  }, []);

  return (
    <Ctx.Provider value={{ ...state, reload, loadMore, markRead, markAllRead, deleteOne, deleteAll }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNotifications must be inside NotificationsProvider');
  return ctx;
}
