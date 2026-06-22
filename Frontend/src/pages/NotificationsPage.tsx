import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useNotifications } from '../features/notifications/NotificationsContext';
import NotificationItem from '../features/notifications/NotificationItem';
import type { NotificationType } from '../features/notifications/notificationsApi';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';

const TYPE_FILTERS: { label: string; value: NotificationType | '' }[] = [
  { label: 'All',       value: ''         },
  { label: 'Follow-up', value: 'followup' },
  { label: 'Invoice',   value: 'invoice'  },
  { label: 'Renewal',   value: 'renewal'  },
];

export default function NotificationsPage() {
  const {
    notifications,
    unreadCount,
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    markRead,
    markAllRead,
    deleteOne,
    deleteAll,
  } = useNotifications();
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  const [typeFilter,   setTypeFilter]   = useState<NotificationType | ''>('');
  const [unreadOnly,   setUnreadOnly]   = useState(false);
  const [triggering,   setTriggering]   = useState(false);
  const [triggerMsg,   setTriggerMsg]   = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  // Sentinel div at the bottom - when it enters the viewport, load the next page
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMore();
        }
      },
      { rootMargin: '200px' }, // start loading 200px before the sentinel is visible
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  async function handleTrigger() {
    setTriggering(true);
    setTriggerMsg(null);
    try {
      await api.post('/reminders/trigger');
      await reload();
      setTriggerMsg('Scan complete - notifications refreshed.');
    } catch {
      setTriggerMsg('Trigger failed. Check the backend logs.');
    } finally {
      setTriggering(false);
      setTimeout(() => setTriggerMsg(null), 4000);
    }
  }

  const filtered = notifications.filter((n) => {
    if (typeFilter && n.type !== typeFilter) return false;
    if (unreadOnly && n.isRead) return false;
    return true;
  });

  return (
    <AppShell title="Notifications">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {unreadCount > 0
                ? `${unreadCount} unread reminder${unreadCount !== 1 ? 's' : ''}`
                : 'All caught up'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isOwner && (
              <button
                onClick={handleTrigger}
                disabled={triggering}
                title="Manually run the reminder scan now"
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-600 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <svg className={`w-3.5 h-3.5 ${triggering ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {triggering ? 'Scanning...' : 'Run scan now'}
              </button>
            )}
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-50 transition-colors"
              >
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              confirmClear ? (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-600">Delete all?</span>
                  <button
                    onClick={async () => { await deleteAll(); setConfirmClear(false); }}
                    className="text-red-600 font-semibold hover:underline"
                  >
                    Confirm
                  </button>
                  <button onClick={() => setConfirmClear(false)} className="text-gray-400 hover:underline">Cancel</button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmClear(true)}
                  className="px-3 py-2 rounded-lg border border-red-200 text-red-500 text-xs font-medium hover:bg-red-50 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete all
                </button>
              )
            )}
          </div>
        </div>

        {/* Trigger result message */}
        {triggerMsg && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm text-indigo-700">
            {triggerMsg}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={[
                'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                typeFilter === f.value
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400',
              ].join(' ')}
            >
              {f.label}
            </button>
          ))}

          <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Unread only
          </label>
        </div>

        {/* Initial load spinner */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-red-700 font-medium mb-3">{error}</p>
            <button
              onClick={reload}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* List */}
        {!loading && !error && (
          <>
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
                <p className="text-sm">
                  {notifications.length === 0
                    ? 'No notifications yet. They appear here when follow-ups, invoices, or renewals are due.'
                    : 'No notifications match your filter.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
                {filtered.map((n) => (
                  <NotificationItem
                    key={n.id}
                    notification={n}
                    onMarkRead={markRead}
                    onDelete={deleteOne}
                  />
                ))}
              </div>
            )}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-1" />

            {/* Load-more spinner (appears at bottom while fetching next page) */}
            {loadingMore && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              </div>
            )}

            {/* End of list indicator */}
            {!hasMore && notifications.length > 0 && (
              <p className="text-xs text-gray-400 text-center pb-2">
                All {notifications.length} notification{notifications.length !== 1 ? 's' : ''} loaded
              </p>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
