import { useState } from 'react';
import type { Invoice } from './invoicesApi';

interface Props {
  invoice: Invoice;
  onDelete: (paymentId: string) => Promise<void>;
  onClose: () => void;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentHistoryPanel({ invoice, onDelete, onClose }: Props) {
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const history = invoice.payments ?? [];

  async function handleDelete(id: string) {
    if (!confirm('Remove this payment entry?')) return;
    setDeleting(id);
    setError(null);
    try {
      await onDelete(id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to remove payment.');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Payment History</h2>
            <p className="text-xs text-gray-400 mt-0.5">Invoice #{invoice.invoiceNumber}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <div className="px-6 py-4 max-h-[55vh] overflow-y-auto">
          {error && (
            <div className="mb-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{error}</div>
          )}

          {history.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No payments recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
                  <th className="pb-2 text-left font-medium">Date</th>
                  <th className="pb-2 text-left font-medium pl-3">Method</th>
                  <th className="pb-2 text-right font-medium">Amount</th>
                  <th className="pb-2 text-left font-medium pl-3">Note</th>
                  <th className="pb-2 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {history.map((p) => (
                  <tr key={p.id} className="group">
                    <td className="py-2 text-gray-600 whitespace-nowrap">{fmt(p.date)}</td>
                    <td className="py-2 pl-3 text-gray-500 whitespace-nowrap">{p.method || '-'}</td>
                    <td className="py-2 text-right font-medium text-gray-900 whitespace-nowrap">
                      ${money(p.amount)}
                    </td>
                    <td className="py-2 pl-3 text-gray-400 text-xs">{p.note || '-'}</td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => handleDelete(p.id)}
                        disabled={deleting === p.id}
                        className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 opacity-0 group-hover:opacity-100"
                        title="Remove payment"
                      >
                        {deleting === p.id ? '...' : ''}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={2} className="pt-3 text-xs font-semibold text-gray-500 uppercase">Paid</td>
                  <td className="pt-3 text-right font-bold text-gray-900">
                    ${money(history.reduce((s, p) => s + p.amount, 0))}
                  </td>
                  <td colSpan={2} />
                </tr>
                <tr>
                  <td colSpan={2} className="pt-1 text-xs font-semibold text-gray-500 uppercase">Balance Due</td>
                  <td className={`pt-1 text-right font-bold ${(invoice.balanceDue ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${money(invoice.balanceDue ?? 0)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="flex justify-end px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
