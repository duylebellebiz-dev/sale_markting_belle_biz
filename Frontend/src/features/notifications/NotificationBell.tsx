import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from './NotificationsContext';
import NotificationItem from './NotificationItem';
import NavIcon from '../layout/NavIcon';

export default function NotificationBell() {
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const recent = notifications.slice(0, 8);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <NavIcon name="bell" className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown - fixed width, never overflows viewport */}
      {open && (
        <div
          className="
            fixed z-50
            bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden
            w-[340px] sm:w-96
          "
          style={dropdownStyle(ref)}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">
              Notifications
              {unreadCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                  {unreadCount}
                </span>
              )}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead()}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Items */}
          <div className="max-h-[360px] overflow-y-auto divide-y divide-gray-50">
            {recent.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-gray-400">
                No notifications yet.
              </div>
            ) : (
              recent.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onMarkRead={(id) => { markRead(id); }}
                  compact
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <button
                onClick={() => { setOpen(false); navigate('/notifications'); }}
                className="w-full text-center text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
              >
                View all {notifications.length} notification{notifications.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Position the dropdown below the bell button, keeping it inside the viewport */
function dropdownStyle(ref: React.RefObject<HTMLDivElement | null>): React.CSSProperties {
  if (!ref.current) return {};
  const rect = ref.current.getBoundingClientRect();
  const dropdownWidth = 384; // w-96
  const gap = 8; // mt-2

  // Align to the right of the bell button; shift left if it would overflow
  let left = rect.right - dropdownWidth;
  if (left < 8) left = 8;
  if (left + dropdownWidth > window.innerWidth - 8)
    left = window.innerWidth - dropdownWidth - 8;

  return {
    top: rect.bottom + gap,
    left,
  };
}
