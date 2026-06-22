import { useEffect, useState } from 'react';
import { emailCampaignApi, type EmailLogEntry } from './emailCampaignApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDatetime(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_STYLES: Record<string, string> = {
  queued:     'bg-gray-100 text-gray-500',
  sent:       'bg-blue-100 text-blue-700',
  delivered:  'bg-green-100 text-green-700',
  opened:     'bg-indigo-100 text-indigo-700',
  clicked:    'bg-purple-100 text-purple-700',
  bounced:    'bg-red-100 text-red-700',
  complained: 'bg-orange-100 text-orange-700',
  failed:     'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface Props {
  customerId: string;
  customerName: string;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CustomerEmailHistoryModal({ customerId, customerName, onClose }: Props) {
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    emailCampaignApi
      .getCustomerHistory(customerId)
      .then((data) => { if (!cancelled) { setLogs(data); setLoading(false); } })
      .catch((e) => {
        if (!cancelled) {
          setError(e?.response?.data?.message ?? 'Failed to load email history');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [customerId]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Email History</h2>
            <p className="text-sm text-gray-500 mt-0.5">{customerName}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              className="w-5 h-5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="py-16 text-center text-gray-400 text-sm">Loading history...</div>
          )}

          {!loading && error && (
            <div className="m-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="py-16 text-center text-gray-400">
              <p className="text-sm">No emails have been sent to this customer yet.</p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Sent</Th>
                  <Th>Opened</Th>
                  <Th>Clicked</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 max-w-[260px]">
                      <p className="font-medium text-gray-900 truncate">{log.subject || '(no subject)'}</p>
                      {log.campaignId && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          Campaign - {fmtDatetime(log.campaignId.createdAt)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {fmtDatetime(log.sentAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {log.openedAt ? fmtDatetime(log.openedAt) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                      {log.clickedAt ? fmtDatetime(log.clickedAt) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && logs.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-400 text-right">
            {logs.length} email{logs.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
