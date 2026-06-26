import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { emailThreadsApi, type UnmatchedMessage } from '../features/email/emailThreadsApi';
import { customersApi, type Customer } from '../features/customers/customersApi';

function fmtDatetime(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function UnmatchedRepliesPage() {
  const [messages, setMessages] = useState<UnmatchedMessage[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [linking, setLinking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    Promise.all([emailThreadsApi.listUnmatched(), customersApi.list()])
      .then(([msgs, custs]) => {
        setMessages(msgs);
        setCustomers(custs);
        setLoading(false);
      })
      .catch((e) => {
        setError(e?.response?.data?.message ?? 'Failed to load unmatched replies');
        setLoading(false);
      });
  }, []);

  async function handleLink(messageId: string) {
    const customerId = selected[messageId];
    if (!customerId) return;
    setLinking(messageId);
    try {
      await emailThreadsApi.linkUnmatched(messageId, customerId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to link reply');
    } finally {
      setLinking(null);
    }
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto py-10 px-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Unmatched Replies</h1>
        <p className="text-sm text-gray-500 mb-8">
          Inbound Gmail replies whose sender address didn't match any existing customer. Link each
          one to the right customer to fold it into that customer's Email History thread.
        </p>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-6">
            {error}
          </div>
        )}

        {loading ? (
          <div className="h-24 bg-gray-100 rounded-xl animate-pulse" />
        ) : messages.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-gray-400 text-sm">
            No unmatched replies.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((m) => (
              <div key={m.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-sm font-medium text-gray-900">{m.from}</p>
                  <p className="text-xs text-gray-400">{fmtDatetime(m.receivedAt ?? m.createdAt)}</p>
                </div>
                <p className="font-medium text-gray-800 mb-1">{m.subject || '(no subject)'}</p>
                <p className="text-sm text-gray-600 whitespace-pre-wrap mb-4 line-clamp-4">
                  {m.bodyText || m.bodyHtml.replace(/<[^>]+>/g, ' ')}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selected[m.id] ?? ''}
                    onChange={(e) => setSelected((prev) => ({ ...prev, [m.id]: e.target.value }))}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a customer…</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.customerName} {c.email ? `(${c.email})` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleLink(m.id)}
                    disabled={!selected[m.id] || linking === m.id}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  >
                    {linking === m.id ? 'Linking…' : 'Link'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
