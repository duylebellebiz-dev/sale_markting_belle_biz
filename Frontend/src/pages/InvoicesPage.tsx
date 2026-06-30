import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useInvoices } from '../features/invoices/useInvoices';
import InvoiceStatusBadge from '../features/invoices/InvoiceStatusBadge';
import { invoicesApi, INVOICE_STATUS_LABELS } from '../features/invoices/invoicesApi';
import type { Invoice } from '../features/invoices/invoicesApi';
import { useAuth } from '../context/AuthContext';
import { usePermission } from '../features/staff/usePermission';
import SendInvoiceEmailModal from '../features/invoices/SendInvoiceEmailModal';

type Modal = { type: 'sendEmail'; invoice: Invoice } | null;

function customerName(inv: Invoice) {
  if (typeof inv.customerId === 'object') return inv.customerId.customerName;
  return '-';
}

// Shop/business name — prefer the billTo snapshot (always set at invoice
// creation time), fall back to the live customer record.
function shopName(inv: Invoice) {
  if (inv.billTo?.name) return inv.billTo.name;
  if (typeof inv.customerId === 'object') return inv.customerId.shopName || inv.customerId.customerName;
  return '-';
}

function fmt(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function money(n: number) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_ORDER: Invoice['status'][] = ['Draft', 'Sent', 'PartiallyPaid', 'Overdue', 'Paid', 'Cancelled'];

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOwner      = user?.role === 'owner';
  const canInvoice   = usePermission('createInvoice');
  const canExportPdf = usePermission('exportInvoicePdf');
  const canSendEmail = usePermission('sendEmail');
  const { invoices, loading, error, reload, remove, markSent, markUnpaid, cancel } = useInvoices();

  const [modal, setModal] = useState<Modal>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function extractError(err: unknown) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Action failed.');
  }

  async function runAction(fn: () => Promise<unknown>) {
    setActionError(null);
    try { await fn(); } catch (err) { setActionError(extractError(err)); }
  }

  const filtered = invoices.filter((inv) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      customerName(inv).toLowerCase().includes(q) ||
      shopName(inv).toLowerCase().includes(q);
    const matchStatus = !statusFilter || inv.status === statusFilter;
    const dueDate = inv.dueDate ? inv.dueDate.slice(0, 10) : null;
    const matchDueFrom = !dueFrom || (dueDate && dueDate >= dueFrom);
    const matchDueTo   = !dueTo   || (dueDate && dueDate <= dueTo);
    return matchSearch && matchStatus && matchDueFrom && matchDueTo;
  });

  // Summary stats for partially-paid invoices
  const partialCount  = invoices.filter((i) => i.status === 'PartiallyPaid').length;
  const overdueCount  = invoices.filter((i) => i.status === 'Overdue').length;
  const totalOutstanding = invoices
    .filter((i) => i.status !== 'Paid' && i.status !== 'Cancelled' && i.status !== 'Draft')
    .reduce((s, i) => s + Number(i.balanceDue ?? 0), 0);

  return (
    <AppShell title="Invoices">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Invoices</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isOwner ? 'All invoices across your business' : 'Invoices for your customers'}
            </p>
          </div>
          {canInvoice && (
            <button
              onClick={() => navigate('/invoices/new')}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + New Invoice
            </button>
          )}
        </div>

        {/* Quick stats */}
        {!loading && !error && invoices.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <StatChip
              label="Outstanding Balance"
              value={`$${money(totalOutstanding)}`}
              color={totalOutstanding > 0 ? 'red' : 'green'}
              onClick={() => setStatusFilter('')}
            />
            <StatChip
              label="Partially Paid"
              value={String(partialCount)}
              color={partialCount > 0 ? 'amber' : 'gray'}
              onClick={() => setStatusFilter('PartiallyPaid')}
            />
            <StatChip
              label="Overdue"
              value={String(overdueCount)}
              color={overdueCount > 0 ? 'red' : 'gray'}
              onClick={() => setStatusFilter('Overdue')}
            />
          </div>
        )}

        {/* Action error */}
        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-red-700 font-medium mb-3">{error}</p>
            <button onClick={reload} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by invoice #, customer, or shop name..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All statuses</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
              </select>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500 whitespace-nowrap">Due date</label>
                <input
                  type="date"
                  value={dueFrom}
                  onChange={(e) => setDueFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-400">to</span>
                <input
                  type="date"
                  value={dueTo}
                  onChange={(e) => setDueTo(e.target.value)}
                  className="rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {(dueFrom || dueTo) && (
                  <button
                    onClick={() => { setDueFrom(''); setDueTo(''); }}
                    className="text-xs text-indigo-500 hover:text-indigo-700 whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
                <p className="text-sm">
                  {invoices.length === 0
                    ? 'No invoices yet. Click + New Invoice to create one.'
                    : 'No invoices match your filter.'}
                </p>
                {statusFilter && (
                  <button onClick={() => setStatusFilter('')} className="mt-3 text-xs text-indigo-500 hover:text-indigo-700">
                    Clear filter
                  </button>
                )}
              </div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <Th>Invoice #</Th>
                      <Th>Customer</Th>
                      <Th right>Total</Th>
                      <Th right>Balance Due</Th>
                      <Th>Status</Th>
                      <Th>Date</Th>
                      <Th>Due Date</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((inv) => {
                      const balance = Number(inv.balanceDue ?? 0);
                      const total   = Number(inv.total ?? 0);
                      const isPartial = inv.status === 'PartiallyPaid';

                      return (
                        <tr
                          key={inv.id}
                          className={`hover:bg-gray-50 transition-colors ${isPartial ? 'bg-amber-50/40' : ''}`}
                        >
                          {/* Invoice # - clickable link to detail */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <button
                              onClick={() => navigate(`/invoices/${inv.id}`)}
                              className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              #{inv.invoiceNumber}
                            </button>
                          </td>

                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">
                            <div className="font-medium text-gray-900">{shopName(inv)}</div>
                            {customerName(inv) !== shopName(inv) && (
                              <div className="text-xs text-gray-400">{customerName(inv)}</div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">
                            ${money(total)}
                          </td>

                          {/* Balance due - prominent for partial/overdue */}
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            {balance > 0 ? (
                              <div>
                                <span className={`font-bold ${isPartial ? 'text-amber-700' : inv.status === 'Overdue' ? 'text-red-700' : 'text-orange-600'}`}>
                                  ${money(balance)}
                                </span>
                                {isPartial && (
                                  <p className="text-xs text-amber-500 mt-0.5">
                                    ${money(inv.amountPaid ?? 0)} paid
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="text-green-600 font-medium">$0.00</span>
                            )}
                          </td>

                          {/* Status badge */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              <InvoiceStatusBadge status={inv.status} />
                              {isPartial && (
                                <span className="text-xs text-amber-600">
                                  ${money(balance)} of ${money(total)} remaining
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            <div>{fmt(inv.invoiceDate)}</div>
                            {inv.promisedPaymentDate && !['Paid','Cancelled'].includes(inv.status) && (
                              <div className="text-xs text-blue-500 mt-0.5">
                                Promise: {fmt(inv.promisedPaymentDate)}
                              </div>
                            )}
                          </td>

                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {fmt(inv.dueDate)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 whitespace-nowrap">
                            {confirmId === inv.id ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="text-gray-600">Delete?</span>
                                <button
                                  onClick={() => { setConfirmId(null); runAction(() => remove(inv.id)); }}
                                  className="text-red-600 font-medium hover:underline"
                                >Yes</button>
                                <button onClick={() => setConfirmId(null)} className="text-gray-500 hover:underline">No</button>
                              </span>
                            ) : (
                              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                {/* View detail - always */}
                                <Btn onClick={() => navigate(`/invoices/${inv.id}`)}>View</Btn>

                                {/* Edit - Draft only */}
                                {inv.status === 'Draft' && canInvoice && (
                                  <Btn onClick={() => navigate(`/invoices/${inv.id}/edit`)}>Edit</Btn>
                                )}

                                {/* Send status - Draft */}
                                {inv.status === 'Draft' && canInvoice && (
                                  <Btn onClick={() => runAction(() => markSent(inv.id))} accent>Send</Btn>
                                )}

                                {/* Email */}
                                {canSendEmail && !['Paid', 'Cancelled'].includes(inv.status) && (
                                  <Btn onClick={() => setModal({ type: 'sendEmail', invoice: inv })} accent>Email</Btn>
                                )}

                                {/* Mark Unpaid - Paid only */}
                                {inv.status === 'Paid' && canInvoice && (
                                  <Btn onClick={() => runAction(() => markUnpaid(inv.id))} accent>Mark Unpaid</Btn>
                                )}

                                {/* Cancel */}
                                {!['Cancelled', 'Paid'].includes(inv.status) && canInvoice && (
                                  <Btn onClick={() => runAction(() => cancel(inv.id))} danger>Cancel</Btn>
                                )}

                                {/* PDF */}
                                {canExportPdf && (
                                  <Btn onClick={() => runAction(() => invoicesApi.downloadPdf(inv.id, inv.invoiceNumber))} accent>PDF</Btn>
                                )}

                                {/* Delete - Draft/Cancelled */}
                                {['Draft', 'Cancelled'].includes(inv.status) && canInvoice && (
                                  <Btn onClick={() => setConfirmId(inv.id)} danger>Delete</Btn>
                                )}

                                {/* Hint - delete requires cancelling first */}
                                {!['Draft', 'Cancelled', 'Paid'].includes(inv.status) && canInvoice && (
                                  <span className="text-xs text-gray-400" title="Cancel this invoice first to enable Delete">
                                    Cancel to delete
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {filtered.length > 0 && (
              <p className="text-xs text-gray-400 text-right">
                {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {modal?.type === 'sendEmail' && (
        <SendInvoiceEmailModal
          invoice={modal.invoice}
          onClose={() => setModal(null)}
          onSent={() => { setModal(null); reload(); }}
        />
      )}
    </AppShell>
  );
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`px-4 py-3 ${right ? 'text-right' : 'text-left'} font-medium`}>{children}</th>;
}

function Btn({ children, onClick, accent, danger }: {
  children: React.ReactNode;
  onClick: () => void;
  accent?: boolean;
  danger?: boolean;
}) {
  const cls = danger
    ? 'text-red-500 hover:text-red-700'
    : accent
    ? 'text-indigo-600 hover:text-indigo-800'
    : 'text-gray-500 hover:text-gray-800';
  return (
    <button onClick={onClick} className={`text-xs font-medium transition-colors ${cls}`}>
      {children}
    </button>
  );
}

function StatChip({ label, value, color, onClick }: {
  label: string;
  value: string;
  color: 'red' | 'amber' | 'green' | 'gray';
  onClick: () => void;
}) {
  const colors = {
    red:   'bg-red-50 border-red-200 text-red-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray:  'bg-gray-50 border-gray-200 text-gray-500',
  };
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border px-4 py-3 text-left w-full hover:opacity-80 transition-opacity ${colors[color]}`}
    >
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs mt-0.5 opacity-70">{label}</div>
    </button>
  );
}
