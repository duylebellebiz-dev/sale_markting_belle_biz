import { useEffect, useRef, useState } from 'react';
import { customersApi, type Customer, type FollowUpHistoryEntry } from './customersApi';

interface Props {
  customer: Customer;
  onSubmit: (nextFollowUpAt: string, note?: string) => Promise<void>;
  onClose: () => void;
}

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function historyTitle(item: FollowUpHistoryEntry) {
  switch (item.type) {
    case 'scheduled':
      return 'Follow-up scheduled';
    case 'reminder_sent':
      return 'Reminder sent';
    case 'closed_lost':
      return 'Marked closed lost';
    case 'closed_won':
      return 'Marked closed won';
    default:
      return item.type;
  }
}

export default function FollowUpModal({ customer, onSubmit, onClose }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const defaultDt = tomorrow.toISOString().slice(0, 16);

  const [datetime, setDatetime] = useState(defaultDt);
  const [note, setNote] = useState(customer.note ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<FollowUpHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    setHistoryLoading(true);
    customersApi
      .followUpHistory(customer.id)
      .then((rows) => {
        if (active) setHistory(rows);
      })
      .catch(() => {
        if (active) setHistory([]);
      })
      .finally(() => {
        if (active) setHistoryLoading(false);
      });
    return () => {
      active = false;
    };
  }, [customer.id]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!datetime) { setError('Pick a date and time.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(new Date(datetime).toISOString(), note || undefined);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg ?? 'Failed to schedule follow-up.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Schedule Follow-up</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Customer: <span className="font-medium text-gray-800">{customer.customerName}</span>
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Follow-up Date & Time *
                </label>
                <input
                  ref={inputRef}
                  type="datetime-local"
                  value={datetime}
                  onChange={(e) => setDatetime(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                  Note (optional)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32 resize-none"
                  placeholder="What to follow up about..."
                />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-800">Follow-up History</h3>
                {historyLoading && <span className="text-xs text-gray-400">Loading...</span>}
              </div>
              {history.length === 0 && !historyLoading ? (
                <p className="text-sm text-gray-500">No follow-up history yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {history.map((item) => (
                    <div key={item.id} className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-gray-800">{historyTitle(item)}</p>
                        <span className="text-xs text-gray-400">{fmtDateTime(item.createdAt)}</span>
                      </div>
                      {item.nextFollowUpAt && (
                        <p className="text-xs text-indigo-600 mt-1">
                          Follow-up for: {fmtDateTime(item.nextFollowUpAt)}
                        </p>
                      )}
                      {item.reminderTriggeredAt && (
                        <p className="text-xs text-amber-600 mt-1">
                          Reminder at: {fmtDateTime(item.reminderTriggeredAt)}
                        </p>
                      )}
                      {item.note && <p className="text-sm text-gray-600 mt-1">{item.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} type="button" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : 'Schedule'}
          </button>
        </div>
      </div>
    </div>
  );
}
