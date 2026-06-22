import { useState } from 'react';
import type { Invoice, AddPaymentPayload } from './invoicesApi';

interface Props {
  invoice: Invoice;
  onSubmit: (payload: AddPaymentPayload) => Promise<void>;
  onClose: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

const METHODS = ['', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'E-Transfer', 'Other'];

export default function MarkPaidModal({ invoice, onSubmit, onClose }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(String(invoice.balanceDue ?? invoice.total ?? 0));
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than 0.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ amount: amt, date: date || undefined, method: method || undefined, note: note || undefined });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  }

  const balance = invoice.balanceDue ?? invoice.total ?? 0;
  const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Record Payment</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <p className="text-sm text-gray-500">
            Invoice <span className="font-medium text-gray-800">#{invoice.invoiceNumber}</span>
            {' '}— total <span className="font-medium text-gray-800">${fmt(invoice.total ?? 0)}</span>
            {balance < (invoice.total ?? 0) && (
              <span className="text-amber-600 ml-1">(balance due: ${fmt(balance)})</span>
            )}
          </p>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Amount Received *</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={INPUT}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Payment Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
                {METHODS.map((m) => <option key={m} value={m}>{m || '— Select —'}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Note (optional)</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={INPUT}
              placeholder="e.g. Bank transfer ref #123"
            />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} type="button" className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving…' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
