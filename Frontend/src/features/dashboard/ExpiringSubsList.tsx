import { useNavigate } from 'react-router-dom';
import type { ExpiringSubscription } from './dashboardApi';

interface Props { subs: ExpiringSubscription[] }

function urgencyClass(days: number) {
  if (days <= 3)  return 'bg-red-50 hover:bg-red-100';
  if (days <= 7)  return 'bg-orange-50 hover:bg-orange-100';
  return 'bg-yellow-50 hover:bg-yellow-100';
}

function urgencyText(days: number) {
  if (days <= 0)  return 'Expires today';
  if (days <= 1)  return 'Expires tomorrow';
  return `${Math.ceil(days)}d left`;
}

function urgencyColor(days: number) {
  if (days <= 3) return 'text-red-600';
  if (days <= 7) return 'text-orange-600';
  return 'text-yellow-700';
}

export default function ExpiringSubsList({ subs }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Services Nearing Expiry
          {subs.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 text-[10px] font-bold">
              {subs.length}
            </span>
          )}
        </p>
        <button
          onClick={() => navigate('/subscriptions')}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          View all &gt;
        </button>
      </div>

      {subs.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No subscriptions expiring soon.</p>
      ) : (
        <div className="space-y-2">
          {subs.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate('/subscriptions')}
              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${urgencyClass(s.daysUntilExpiry)}`}
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {s.customerName ?? '-'}
                  {s.shopName && <span className="text-gray-400 font-normal"> - {s.shopName}</span>}
                </p>
                <p className="text-[11px] text-gray-500 truncate">{s.serviceName ?? '-'}</p>
              </div>
              <span className={`ml-3 text-xs font-bold whitespace-nowrap ${urgencyColor(s.daysUntilExpiry)}`}>
                {urgencyText(s.daysUntilExpiry)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
