import { useEffect, useState } from 'react';
import { emailThreadsApi, type ThreadItem } from './emailThreadsApi';

function fmtDatetime(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const STATUS_STYLES: Record<string, string> = {
  queued: 'bg-gray-100 text-gray-500',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  opened: 'bg-indigo-100 text-indigo-700',
  clicked: 'bg-purple-100 text-purple-700',
  bounced: 'bg-red-100 text-red-700',
  complained: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

interface Props {
  customerId: string;
  customerName: string;
  onClose: () => void;
}

export default function CustomerEmailHistoryModal({ customerId, customerName, onClose }: Props) {
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [replySubject, setReplySubject] = useState('');
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  function loadThread() {
    setLoading(true);
    setError('');
    emailThreadsApi
      .getThread(customerId)
      .then((data) => {
        setItems(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.response?.data?.message ?? 'Failed to load email history');
        setLoading(false);
      });
  }

  useEffect(() => {
    loadThread();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!replySubject.trim() || !replyBody.trim()) return;
    setSending(true);
    setSendError('');
    try {
      await emailThreadsApi.reply(customerId, replySubject.trim(), replyBody.trim());
      setReplySubject('');
      setReplyBody('');
      loadThread();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setSendError(msg ?? 'Failed to send reply. Is Gmail connected in Email Settings?');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl bg-white shadow-xl overflow-hidden">
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
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-5 h-5"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading history...</div>}

          {!loading && error && (
            <div className="m-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {!loading && !error && items.length === 0 && (
            <div className="py-16 text-center text-gray-400">
              <p className="text-sm">No emails have been exchanged with this customer yet.</p>
            </div>
          )}

          {!loading && !error && items.length > 0 && (
            <div className="divide-y divide-gray-100">
              {items.map((item) => (
                <div key={`${item.kind}-${item.id}`} className="px-6 py-4">
                  {item.kind === 'outbound_log' ? (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">
                          Outbound (campaign/invoice)
                        </p>
                        <p className="font-medium text-gray-900 truncate">{item.subject || '(no subject)'}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{fmtDatetime(item.sentAt ?? item.createdAt)}</p>
                      </div>
                      <StatusBadge status={item.status} />
                    </div>
                  ) : (
                    <div
                      className={`rounded-lg p-3 ${
                        item.direction === 'inbound' ? 'bg-gray-50' : 'bg-indigo-50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-xs font-medium text-gray-500">
                          {item.direction === 'inbound' ? `From ${item.from}` : `Reply to ${item.to}`}
                        </p>
                        <p className="text-xs text-gray-400">{fmtDatetime(item.at)}</p>
                      </div>
                      <p className="font-medium text-gray-900 mb-1">{item.subject || '(no subject)'}</p>
                      {item.bodyHtml ? (
                        <div
                          className="text-sm text-gray-700 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: item.bodyHtml }}
                        />
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{item.bodyText}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <form onSubmit={handleReply} className="border-t border-gray-200 px-6 py-4 space-y-2 bg-gray-50">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Reply via Gmail</p>
          <input
            type="text"
            value={replySubject}
            onChange={(e) => setReplySubject(e.target.value)}
            placeholder="Subject"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write your reply…"
            rows={3}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {sendError && <p className="text-sm text-red-600">{sendError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={sending || !replySubject.trim() || !replyBody.trim()}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {sending ? 'Sending…' : 'Send Reply'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
