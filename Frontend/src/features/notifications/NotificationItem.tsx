import { useNavigate } from 'react-router-dom';
import type { AppNotification, NotificationType } from './notificationsApi';

const TYPE_STYLES: Record<NotificationType, { dot: string; label: string }> = {
  followup: { dot: 'bg-yellow-400', label: 'Follow-up' },
  invoice:  { dot: 'bg-blue-500',   label: 'Invoice'   },
  renewal:  { dot: 'bg-purple-500', label: 'Renewal'   },
};

const TYPE_ROUTES: Record<NotificationType, string> = {
  followup: '/customers',
  invoice:  '/invoices',
  renewal:  '/subscriptions',
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
  onDelete?: (id: string) => void;
  compact?: boolean; // true = dropdown style, false = full page row
}

export default function NotificationItem({ notification: n, onMarkRead, onDelete, compact }: Props) {
  const navigate = useNavigate();
  const style = TYPE_STYLES[n.type] ?? TYPE_STYLES.followup;

  function handleClick() {
    if (!n.isRead) onMarkRead(n.id);
    navigate(TYPE_ROUTES[n.type] ?? '/notifications');
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    onDelete?.(n.id);
  }

  return (
    <div
      className={[
        'flex items-start gap-3 transition-colors',
        compact ? 'px-4 py-3 hover:bg-gray-50' : 'px-5 py-4 hover:bg-gray-50 rounded-xl',
        !n.isRead ? 'bg-indigo-50/60' : '',
      ].join(' ')}
    >
      {/* Type dot */}
      <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${style.dot}`} />

      {/* Clickable content */}
      <div
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        className="flex-1 min-w-0 cursor-pointer"
      >
        {/* Type label + time */}
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {style.label}
          </span>
          <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
          {!n.isRead && (
            <span className="ml-auto shrink-0 w-1.5 h-1.5 rounded-full bg-indigo-500" />
          )}
        </div>
        {/* Message */}
        <p className={`text-sm leading-snug ${n.isRead ? 'text-gray-500' : 'text-gray-800 font-medium'}`}>
          {n.message}
        </p>
      </div>

      {/* Delete button - only shown on full page (not compact dropdown) */}
      {!compact && onDelete && (
        <button
          onClick={handleDelete}
          title="Delete notification"
          className="shrink-0 mt-0.5 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}
