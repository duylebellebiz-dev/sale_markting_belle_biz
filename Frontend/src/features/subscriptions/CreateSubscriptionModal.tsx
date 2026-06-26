import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';
import CustomerSearchPicker, { type PickedCustomer } from '../customers/CustomerSearchPicker';
import type { CreateSubscriptionPayload } from './subscriptionsApi';

interface Service  { id: string; name: string; price: number; isActive: boolean; }
interface InvoiceLineItem { serviceId?: string | null; description: string; rate: number; }
interface Invoice  { id: string; invoiceNumber: string; total?: number; lineItems?: InvoiceLineItem[]; }

interface Props {
  onSubmit: (payload: CreateSubscriptionPayload) => Promise<void>;
  onClose: () => void;
  /** Pre-select customer + invoice, e.g. opened from the "Subscribe" action on a paid invoice. */
  presetCustomer?: PickedCustomer;
  presetInvoiceId?: string;
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function CreateSubscriptionModal({ onSubmit, onClose, presetCustomer, presetInvoiceId }: Props) {
  const [services,  setServices]  = useState<Service[]>([]);
  const [invoices,  setInvoices]  = useState<Invoice[]>([]);

  const [customer,      setCustomer]      = useState<PickedCustomer | null>(presetCustomer ?? null);
  const [serviceId,     setServiceId]     = useState('');
  const [invoiceId,     setInvoiceId]     = useState('');
  const [createInvoice, setCreateInvoice] = useState(true);
  const [servicePrice,  setServicePrice]  = useState('');
  const [expiryDate,    setExpiryDate]    = useState('');
  const [startDate,     setStartDate]     = useState('');
  const [closingDate,   setClosingDate]   = useState('');
  const [note,          setNote]          = useState('');

  const [submitting,   setSubmitting]   = useState(false);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [loadingData,  setLoadingData]  = useState(true);
  const [error,        setError]        = useState<string | null>(null);

  const firstFieldRef = useRef<boolean>(false);
  firstFieldRef.current = true;

  useEffect(() => {
    setLoadingData(true);
    api.get<Service[]>('/services')
      .then((r) => {
        setServices(Array.isArray(r.data) ? r.data.filter((s) => s.isActive) : []);
        setLoadingData(false);
      })
      .catch(() => {
        setLoadError('Failed to load services. Please close and try again.');
        setLoadingData(false);
      });
  }, []);

  // When customer changes, load their invoices for linking
  useEffect(() => {
    if (!customer) { setInvoices([]); setInvoiceId(''); return; }
    api.get<Invoice[]>(`/invoices/by-customer/${customer.id}`)
      .then((r) => setInvoices(Array.isArray(r.data) ? r.data : []))
      .catch(() => setInvoices([]));
  }, [customer]);

  // When service changes, pre-fill price
  useEffect(() => {
    const svc = services.find((s) => s.id === serviceId);
    if (svc) setServicePrice(String(svc.price));
  }, [serviceId, services]);

  function handleInvoiceChange(id: string) {
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    const lineItem = inv?.lineItems?.find((li) => li.serviceId);
    if (lineItem?.serviceId) {
      setServiceId(lineItem.serviceId);
      setServicePrice(String(lineItem.rate));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!customer)    { setError('Select a customer.'); return; }
    if (!serviceId)   { setError('Select a service.');  return; }
    if (!expiryDate)  { setError('Expiry date is required.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        customerId:    customer.id,
        serviceId,
        invoiceId:     invoiceId    || undefined,
        createInvoice: !invoiceId && createInvoice,
        closingDate:   closingDate  || undefined,
        startDate:     startDate    || undefined,
        expiryDate,
        servicePrice:  servicePrice ? parseFloat(servicePrice) : undefined,
        note:          note         || undefined,
      });
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New Subscription</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {loadError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{loadError}</div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-2">
              <span>{error}</span>
              <button type="button" onClick={() => setError(null)} className="text-red-400 hover:text-red-600 shrink-0"></button>
            </div>
          )}

          <Field label="Customer *">
            <CustomerSearchPicker
              value={customer}
              onChange={(c) => { setCustomer(c); setInvoiceId(''); }}
              autoFocus
              disabled={!!loadError}
            />
          </Field>

          <Field label="Service *">
            <select
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className={INPUT}
              disabled={loadingData}
            >
              <option value="">
                {loadingData ? 'Loading services...' : services.length === 0 ? '- No active services -' : '- Select service -'}
              </option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} (${s.price})</option>
              ))}
            </select>
            {!loadingData && services.length === 0 && !loadError && (
              <p className="text-xs text-amber-600 mt-1">No active services. Ask the owner to add services first.</p>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Service Price">
              <input
                type="number"
                min="0"
                step="0.01"
                value={servicePrice}
                onChange={(e) => setServicePrice(e.target.value)}
                className={INPUT}
                placeholder="Auto from service"
              />
            </Field>

            <Field label="Link Invoice">
              <select
                value={invoiceId}
                onChange={(e) => handleInvoiceChange(e.target.value)}
                className={INPUT}
                disabled={!customer || createInvoice}
              >
                <option value="">{customer ? '- Optional -' : '- Select customer first -'}</option>
                {invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    #{inv.invoiceNumber} (${Number(inv.total ?? 0).toFixed(2)})
                  </option>
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
                  Auto-create a Draft invoice for this service
                </label>
              )}
            </Field>

            <Field label="Start Date">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={INPUT} />
            </Field>

            <Field label="Expiry Date *">
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className={INPUT} />
            </Field>

            <Field label="Closing Date">
              <input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className={INPUT} />
            </Field>
          </div>

          <Field label="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${INPUT} h-20 resize-none`}
              placeholder="Optional notes..."
            />
          </Field>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : 'Create Subscription'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}
