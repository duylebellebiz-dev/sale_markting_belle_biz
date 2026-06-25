import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import InvoiceStatusBadge from '../features/invoices/InvoiceStatusBadge';
import SendInvoiceEmailModal from '../features/invoices/SendInvoiceEmailModal';
import { invoicesApi } from '../features/invoices/invoicesApi';
import AddressBlock from '../features/invoices/AddressBlock';
import type { Invoice } from '../features/invoices/invoicesApi';
import { usePermission } from '../features/staff/usePermission';

//  Helpers 

function money(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtDateTime(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function invoiceActivityLabel(type: 'sent' | 'emailed' | 'reminder') {
  switch (type) {
    case 'sent':
      return 'Marked Sent';
    case 'emailed':
      return 'Invoice Emailed';
    case 'reminder':
      return 'Reminder Sent';
    default:
      return type;
  }
}

//  Sub-components 

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';
const METHODS = ['', 'Cash', 'Bank Transfer', 'Cheque', 'Credit Card', 'E-Transfer', 'Other'];

function RecordPaymentInline({
  invoice,
  onSuccess,
}: {
  invoice: Invoice;
  onSuccess: (updated: Invoice) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setAmount(String(invoice.balanceDue > 0 ? invoice.balanceDue : invoice.total ?? 0));
    setDate(today);
    setMethod('');
    setNote('');
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount greater than 0.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const updated = await invoicesApi.addPayment(invoice.id, {
        amount: amt,
        date: date || undefined,
        method: method || undefined,
        note: note || undefined,
      });
      onSuccess(updated);
      setOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors"
      >
        Record Payment
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-green-900">Record Payment</h3>
        <button onClick={() => setOpen(false)} className="text-green-400 hover:text-green-700 text-lg leading-none">&times;</button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Amount *</label>
          <input
            type="number" min="0.01" step="0.01"
            value={amount} onChange={(e) => setAmount(e.target.value)}
            className={INPUT} autoFocus
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Method</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)} className={INPUT}>
            {METHODS.map((m) => <option key={m} value={m}>{m || '- Select -'}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Note</label>
          <input
            value={note} onChange={(e) => setNote(e.target.value)}
            className={INPUT} placeholder="Optional"
          />
        </div>
        <div className="col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">Cancel</button>
          <button
            type="submit" disabled={submitting}
            className="px-4 py-1.5 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Confirm Payment'}
          </button>
        </div>
      </form>
    </div>
  );
}

function PromisedDateInline({
  invoice,
  onSuccess,
}: {
  invoice: Invoice;
  onSuccess: (updated: Invoice) => void;
}) {
  const existing = invoice.promisedPaymentDate?.slice(0, 10) ?? '';
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(existing);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    setDate(existing);
    setError(null);
    setOpen(true);
  }

  async function save(d?: string) {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await invoicesApi.updatePromisedDate(invoice.id, d);
      onSuccess(updated);
      setOpen(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(msg ?? 'Failed to update.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openForm}
        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
      >
        {existing ? `Promise: ${fmtDate(existing)}` : 'Set Promised Date'}
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-indigo-900">Promised Payment Date</h3>
        <button onClick={() => setOpen(false)} className="text-indigo-400 hover:text-indigo-700 text-lg leading-none">&times;</button>
      </div>
      {error && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>}
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Date customer promised to pay</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={INPUT} autoFocus />
      </div>
      <div className="flex items-center justify-between">
        {existing ? (
          <button onClick={() => save(undefined)} disabled={submitting} className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50">
            Clear promised date
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => save(date || undefined)} disabled={submitting || !date}
            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Saving...' : 'Set Date'}
          </button>
        </div>
      </div>
    </div>
  );
}

//  Main Page 

type ActionModal = { type: 'sendEmail' } | null;

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const canInvoice   = usePermission('createInvoice');
  const canExportPdf = usePermission('exportInvoicePdf');
  const canSendEmail = usePermission('sendEmail');

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(null);
    try {
      const inv = await invoicesApi.get(id);
      setInvoice(inv);
    } catch {
      setLoadError('Could not load invoice.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function runAction(fn: () => Promise<Invoice | void>) {
    setActionError(null);
    try {
      const result = await fn();
      if (result && typeof result === 'object' && 'id' in result) {
        setInvoice(result as Invoice);
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setActionError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Action failed.'));
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!invoice) return;
    setDeleting(paymentId);
    setActionError(null);
    try {
      const updated = await invoicesApi.removePayment(invoice.id, paymentId);
      setInvoice(updated);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setActionError(msg ?? 'Failed to remove payment.');
    } finally {
      setDeleting(null);
    }
  }

  async function handleCancel() {
    if (!invoice) return;
    setConfirmCancel(false);
    await runAction(() => invoicesApi.cancel(invoice.id));
  }

  async function handleMarkUnpaid() {
    if (!invoice) return;
    await runAction(() => invoicesApi.markUnpaid(invoice.id));
  }

  async function handleSend() {
    if (!invoice) return;
    await runAction(() => invoicesApi.markSent(invoice.id));
  }

  if (loading) {
    return (
      <AppShell title="Invoice">
        <div className="flex items-center justify-center py-32">
          <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      </AppShell>
    );
  }

  if (loadError || !invoice) {
    return (
      <AppShell title="Invoice">
        <div className="max-w-3xl mx-auto mt-10 rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
          <p className="text-red-700 font-medium mb-3">{loadError ?? 'Invoice not found.'}</p>
          <button onClick={load} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 mr-3">Retry</button>
          <button onClick={() => navigate('/invoices')} className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-sm hover:bg-red-100">Back to Invoices</button>
        </div>
      </AppShell>
    );
  }

  const { status } = invoice;
  const isPaid       = status === 'Paid';
  const isPartial    = status === 'Partially Paid';
  const isCancelled  = status === 'Cancelled';
  const isDraft      = status === 'Draft';
  const needsPayment = status === 'Sent' || status === 'Overdue' || isPartial;

  const paidSoFar = invoice.payments?.reduce((s, p) => s + p.amount, 0) ?? invoice.amountPaid ?? 0;
  const balance   = invoice.balanceDue ?? 0;
  const total     = invoice.total ?? 0;
  const custName  = typeof invoice.customerId === 'object' ? invoice.customerId.customerName : '-';

  return (
    <AppShell title={`Invoice #${invoice.invoiceNumber}`}>
      <div className="max-w-4xl mx-auto space-y-5">

        {/*  Back + Header  */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => navigate('/invoices')}
              className="text-xs text-gray-400 hover:text-gray-700 mb-1 flex items-center gap-1"
            >
              ? Invoices
            </button>
            <h2 className="text-2xl font-bold text-gray-900">Invoice #{invoice.invoiceNumber}</h2>
            <p className="text-sm text-gray-500 mt-0.5">{custName}</p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </div>

        {/*  Action error  */}
        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}

        {/*  Partial Paid banner  */}
        {isPartial && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-3 flex items-center gap-3">
            <span className="text-amber-600 text-lg"></span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Partially Paid - ${money(balance)} of ${money(total)} remaining
              </p>
              <p className="text-xs text-amber-600 mt-0.5">${money(paidSoFar)} received so far</p>
            </div>
          </div>
        )}

        {/*  Promised date banner  */}
        {invoice.promisedPaymentDate && !isPaid && !isCancelled && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 px-5 py-3 text-sm text-blue-800">
            Customer promised to pay by <span className="font-semibold">{fmtDate(invoice.promisedPaymentDate)}</span>
          </div>
        )}

        {/*  Money summary  */}
        <div className="grid grid-cols-3 gap-4">
          <SummaryCard label="Total" value={`$${money(total)}`} />
          <SummaryCard
            label="Amount Paid"
            value={`$${money(paidSoFar)}`}
            highlight={paidSoFar > 0 ? 'green' : undefined}
          />
          <SummaryCard
            label="Balance Due"
            value={`$${money(balance)}`}
            highlight={balance > 0 ? (isPartial ? 'amber' : 'red') : 'green'}
            large
          />
        </div>

        {/*  Payment actions (Sent / Overdue / Partially Paid)  */}
        {needsPayment && canInvoice && (
          <div className="space-y-3">
            <RecordPaymentInline invoice={invoice} onSuccess={setInvoice} />
            <PromisedDateInline invoice={invoice} onSuccess={setInvoice} />
          </div>
        )}

        {/*  Payment history  */}
        {(invoice.payments?.length ?? 0) > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Payment History</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
                  <Th>Date</Th>
                  <Th>Method</Th>
                  <Th right>Amount</Th>
                  <Th>Note</Th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {invoice.payments.map((p) => (
                  <tr key={p.id} className="group hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.method || '-'}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">${money(p.amount)}</td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{p.note || '-'}</td>
                    <td className="px-3 py-2.5 text-right">
                      {canInvoice && !isPaid && !isCancelled && (
                        <button
                          onClick={() => {
                            if (confirm('Remove this payment entry?')) handleDeletePayment(p.id);
                          }}
                          disabled={deleting === p.id}
                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40"
                          title="Remove payment"
                        >
                          {deleting === p.id ? '...' : ''}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Total Paid</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">${money(paidSoFar)}</td>
                  <td colSpan={2} />
                </tr>
                <tr className="border-t border-gray-100">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">Balance Due</td>
                  <td className={`px-4 py-2 text-right font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    ${money(balance)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </section>
        )}

        {/*  Invoice details  */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Bill To */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Bill To</h3>
            <AddressBlock
              name={invoice.billTo?.name || '-'}
              address={invoice.billTo?.addressLine}
              nameClassName="text-lg font-bold text-gray-900 leading-tight"
              lineClassName="text-sm text-gray-500 leading-6"
              emptyFallback={
                <>
                  {invoice.billTo?.email && <p className="text-sm text-gray-500 mt-1.5">{invoice.billTo.email}</p>}
                  {invoice.billTo?.phone && <p className="text-sm text-gray-500">{invoice.billTo.phone}</p>}
                </>
              }
            />
          </section>

          {/* Invoice meta */}
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-2">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Details</h3>
            <MetaRow label="Invoice Date" value={fmtDate(invoice.invoiceDate)} />
            <MetaRow label="Due Date" value={fmtDate(invoice.dueDate)} />
            <MetaRow label="Terms" value={invoice.terms || '-'} />
            {invoice.province && <MetaRow label="Province" value={invoice.province} />}
            {invoice.dateSent && <MetaRow label="Date Sent" value={fmtDateTime(invoice.dateSent)} />}
            {invoice.lastReminderAt && <MetaRow label="Last Reminder" value={fmtDateTime(invoice.lastReminderAt)} />}
            {invoice.nextReminderAt && !isPaid && !isCancelled && (
              <MetaRow
                label="Next Reminder"
                value={fmtDate(invoice.nextReminderAt)}
                warn={new Date(invoice.nextReminderAt) < new Date()}
              />
            )}
          </section>
        </div>

        {/*  Line items  */}
        <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Line Items</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
                <Th>#</Th>
                <Th>Description</Th>
                <Th right>Qty</Th>
                <Th right>Rate</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.lineItems.map((item, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{item.description}</p>
                    {item.serviceTerm && (
                      <p className="text-xs text-gray-400 mt-0.5">Service Term: {item.serviceTerm}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">{item.quantity}</td>
                  <td className="px-4 py-3 text-right text-gray-600">${money(item.rate)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">${money(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="border-t border-gray-200 px-5 py-4 flex justify-end">
            <dl className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-600">
                <dt>Sub Total</dt>
                <dd>${money(invoice.subTotal)}</dd>
              </div>
              {(invoice.discount ?? 0) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <dt>Discount ({invoice.discount}%)</dt>
                  <dd>-${money((invoice.subTotal * (invoice.discount ?? 0)) / 100)}</dd>
                </div>
              )}
              {(invoice.shippingCharges ?? 0) !== 0 && (
                <div className="flex justify-between text-gray-600">
                  <dt>Shipping</dt>
                  <dd>${money(invoice.shippingCharges ?? 0)}</dd>
                </div>
              )}
              {(invoice.adjustment ?? 0) !== 0 && (
                <div className="flex justify-between text-gray-600">
                  <dt>Adjustment</dt>
                  <dd>{(invoice.adjustment ?? 0) < 0 ? '-' : ''}${money(Math.abs(invoice.adjustment ?? 0))}</dd>
                </div>
              )}
              {(invoice.taxRate ?? 0) > 0 && (
                <div className="flex justify-between text-gray-600">
                  <dt>{invoice.taxLabel || 'Tax'} ({invoice.taxRate}%)</dt>
                  <dd>${money(invoice.taxAmount)}</dd>
                </div>
              )}
              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-100">
                <dt>Total</dt>
                <dd>${money(total)}</dd>
              </div>
              {paidSoFar > 0 && (
                <div className="flex justify-between text-green-700">
                  <dt>Amount Paid</dt>
                  <dd>-${money(paidSoFar)}</dd>
                </div>
              )}
              <div className={`flex justify-between font-bold pt-1 border-t border-gray-200 ${balance > 0 ? 'text-red-700' : 'text-green-700'}`}>
                <dt>Balance Due</dt>
                <dd>${money(balance)}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/*  Notes & Terms  */}
        {(invoice.customerNote || invoice.termsConditions) && (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-5 space-y-4">
            {invoice.customerNote && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Customer Note</h3>
                <p className="text-sm text-gray-700 whitespace-pre-line">{invoice.customerNote}</p>
              </div>
            )}
            {invoice.termsConditions && (
              <div>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Terms & Conditions</h3>
                <p className="text-sm text-gray-500 whitespace-pre-line">{invoice.termsConditions}</p>
              </div>
            )}
          </section>
        )}

        {(invoice.activities?.length ?? 0) > 0 && (
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <h3 className="text-sm font-semibold text-gray-700">Invoice Activity</h3>
            </div>
            <div className="divide-y divide-gray-100">
              {invoice.activities?.map((activity) => (
                <div key={activity.id} className="px-5 py-3 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-800">
                      {invoiceActivityLabel(activity.type)}
                    </p>
                    {activity.note && <p className="text-sm text-gray-500 mt-0.5">{activity.note}</p>}
                    {activity.balanceSnapshot != null && (
                      <p className="text-xs text-gray-400 mt-1">
                        Balance snapshot: ${money(activity.balanceSnapshot)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-gray-400 whitespace-nowrap">
                    {fmtDateTime(activity.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/*  Bottom action bar  */}
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm px-5 py-4 flex flex-wrap gap-3 items-center">
          {/* Edit - Draft only */}
          {isDraft && canInvoice && (
            <button
              onClick={() => navigate(`/invoices/${invoice.id}/edit`)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
          )}

          {/* Send (status update) - Draft */}
          {isDraft && canInvoice && (
            <button
              onClick={handleSend}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Mark as Sent
            </button>
          )}

          {/* Send Email - Draft/Sent/Overdue/Partially Paid */}
          {canSendEmail && !isPaid && !isCancelled && (
            <button
              onClick={() => setActionModal({ type: 'sendEmail' })}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              Send Email
            </button>
          )}

          {/* Mark Unpaid - Paid only */}
          {isPaid && canInvoice && (
            <button
              onClick={handleMarkUnpaid}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Mark Unpaid
            </button>
          )}

          {/* PDF */}
          {canExportPdf && (
            <button
              onClick={() => invoicesApi.downloadPdf(invoice.id, invoice.invoiceNumber)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Download PDF
            </button>
          )}

          {/* Cancel */}
          {!isCancelled && !isPaid && canInvoice && (
            confirmCancel ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Cancel invoice?</span>
                <button onClick={handleCancel} className="text-red-600 font-medium hover:underline">Yes</button>
                <button onClick={() => setConfirmCancel(false)} className="text-gray-500 hover:underline">No</button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm font-medium hover:bg-red-50 transition-colors"
              >
                Cancel Invoice
              </button>
            )
          )}
        </div>
      </div>

      {/* Send email modal */}
      {actionModal?.type === 'sendEmail' && (
        <SendInvoiceEmailModal
          invoice={invoice}
          onClose={() => setActionModal(null)}
          onSent={() => { setActionModal(null); load(); }}
        />
      )}
    </AppShell>
  );
}

//  Mini components 

function SummaryCard({ label, value, highlight, large }: {
  label: string;
  value: string;
  highlight?: 'green' | 'amber' | 'red';
  large?: boolean;
}) {
  const base = 'rounded-xl border p-4 flex flex-col gap-1';
  const colors =
    highlight === 'green' ? 'bg-green-50 border-green-200' :
    highlight === 'amber' ? 'bg-amber-50 border-amber-200' :
    highlight === 'red'   ? 'bg-red-50 border-red-200' :
    'bg-white border-gray-200';
  const valColor =
    highlight === 'green' ? 'text-green-700' :
    highlight === 'amber' ? 'text-amber-700' :
    highlight === 'red'   ? 'text-red-700' :
    'text-gray-900';

  return (
    <div className={`${base} ${colors} shadow-sm`}>
      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      <span className={`font-bold ${large ? 'text-2xl' : 'text-xl'} ${valColor}`}>{value}</span>
    </div>
  );
}

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 text-left font-medium ${right ? 'text-right' : ''}`}>{children}</th>;
}

function MetaRow({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={warn ? 'text-red-600 font-medium' : 'text-gray-800 font-medium'}>{value}</span>
    </div>
  );
}
