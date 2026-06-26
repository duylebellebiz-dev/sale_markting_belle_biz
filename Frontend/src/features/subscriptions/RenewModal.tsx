import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import type { Subscription, RenewPayload } from './subscriptionsApi';

interface InvoiceLineItem { serviceId?: string | null; rate: number; }
interface Invoice { id: string; invoiceNumber: string; total?: number; lineItems?: InvoiceLineItem[]; }

interface Props {
  subscription: Subscription;
  onSubmit: (payload: RenewPayload) => Promise<void>;
  onClose: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function customerId(sub: Subscription): string {
  if (typeof sub.customerId === 'object') return sub.customerId.id;
  return sub.customerId;
}

function customerLabel(sub: Subscription): string {
  if (typeof sub.customerId === 'object') {
    return sub.customerId.shopName
      ? `${sub.customerId.customerName} - ${sub.customerId.shopName}`
      : sub.customerId.customerName;
  }
  return '-';
}

function serviceLabel(sub: Subscription): string {
  if (typeof sub.serviceId === 'object') return sub.serviceId.name;
  return '-';
}

function serviceIdOf(sub: Subscription): string {
  if (typeof sub.serviceId === 'object') return sub.serviceId.id;
  return sub.serviceId;
}

export default function RenewModal({ subscription, onSubmit, onClose }: Props) {
  const [expiryDate,   setExpiryDate]   = useState('');
  const [startDate,    setStartDate]    = useState(new Date().toISOString().slice(0, 10));
  const [servicePrice, setServicePrice] = useState(String(subscription.servicePrice));
  const [invoiceId,    setInvoiceId]    = useState('');
  const [createInvoice, setCreateInvoice] = useState(true);
  const [note,         setNote]         = useState('');
  const [invoices,     setInvoices]     = useState<Invoice[]>([]);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
    const cId = customerId(subscription);
    if (cId) {
      api.get<Invoice[]>(`/invoices/by-customer/${cId}`)
        .then((r) => setInvoices(r.data))
        .catch(() => {});
    }
  }, [subscription]);

  function handleInvoiceChange(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    const lineItem = inv?.lineItems?.find((li) => li.serviceId === serviceIdOf(subscription));
    if (lineItem) setServicePrice(String(lineItem.rate));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!expiryDate) { setError('New expiry date is required.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        expiryDate,
        startDate:     startDate    || undefined,
        invoiceId:     invoiceId    || undefined,
        createInvoice: !invoiceId && createInvoice,
        servicePrice:  servicePrice ? parseFloat(servicePrice) : undefined,
        note:          note         || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to renew.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Renew Subscription</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
            <p><span className="font-medium">Customer:</span> {customerLabel(subscription)}</p>
            <p><span className="font-medium">Service:</span> {serviceLabel(subscription)}</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">New Start Date</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">New Expiry Date *</label>
              <input ref={firstRef} type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={INPUT} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Price (leave blank to keep current)</label>
            <input type="number" min="0" step="0.01" value={servicePrice}
              onChange={(e) => setServicePrice(e.target.value)} className={INPUT} />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Link Invoice</label>
            <select value={invoiceId} onChange={(e) => handleInvoiceChange(e.target.value)} className={INPUT} disabled={createInvoice}>
              <option value="">- Optional -</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>#{inv.invoiceNumber} (${Number(inv.total ?? 0).toFixed(2)})</option>
              ))}
            </select>
            {!invoiceId && (
              <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                <input
                  type="checkbox"
                  checked={createInvoice}
                  onChange={(e) => setCreateInvoice(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Auto-create a Draft invoice for the new period
              </label>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className={INPUT} placeholder="Optional renewal note..." />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={submitting}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Renewing...' : 'Confirm Renewal'}
          </button>
        </div>
      </div>
    </div>
  );
}
