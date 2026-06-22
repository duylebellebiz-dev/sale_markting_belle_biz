import { useState } from 'react';
import AppShell from '../components/AppShell';
import { useSubscriptions } from '../features/subscriptions/useSubscriptions';
import SubStatusBadge from '../features/subscriptions/SubStatusBadge';
import CreateSubscriptionModal from '../features/subscriptions/CreateSubscriptionModal';
import RenewModal from '../features/subscriptions/RenewModal';
import { useAuth } from '../context/AuthContext';
import type { Subscription, CreateSubscriptionPayload, RenewPayload } from '../features/subscriptions/subscriptionsApi';

type Modal =
  | { type: 'create' }
  | { type: 'renew'; sub: Subscription }
  | null;

function fmt(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function daysUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function customerLabel(sub: Subscription) {
  if (typeof sub.customerId === 'object')
    return sub.customerId.shopName
      ? `${sub.customerId.customerName} - ${sub.customerId.shopName}`
      : sub.customerId.customerName;
  return '-';
}

function serviceLabel(sub: Subscription) {
  return typeof sub.serviceId === 'object' ? sub.serviceId.name : '-';
}

function invoiceLabel(sub: Subscription) {
  if (!sub.invoiceId) return null;
  if (typeof sub.invoiceId === 'object')
    return `#${sub.invoiceId.invoiceNumber} - $${(sub.invoiceId.total ?? sub.invoiceId.amount ?? 0).toLocaleString()}`;
  return null;
}

const STATUS_ORDER: Subscription['status'][] = ['Active', 'Renewed', 'Expired', 'Cancelled'];

export default function SubscriptionsPage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const { subscriptions, loading, error, reload, create, renew, cancel } = useSubscriptions();

  const [modal,       setModal]       = useState<Modal>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [search,      setSearch]      = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null);

  function extractError(err: unknown) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })
      ?.response?.data?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Action failed.');
  }

  async function handleCreate(payload: CreateSubscriptionPayload) {
    await create(payload);
  }

  async function handleRenew(id: string, payload: RenewPayload) {
    await renew(id, payload);
  }

  async function handleCancel(id: string) {
    setConfirmId(null);
    setActionError(null);
    try { await cancel(id); }
    catch (err) { setActionError(extractError(err)); }
  }

  const filtered = subscriptions.filter((sub) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      customerLabel(sub).toLowerCase().includes(q) ||
      serviceLabel(sub).toLowerCase().includes(q);
    return matchSearch && (!statusFilter || sub.status === statusFilter);
  });

  return (
    <AppShell title="Subscriptions">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Subscriptions</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isOwner ? 'All closed deals and active services' : 'Your closed deals and active services'}
            </p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Subscription
          </button>
        </div>

        {/* Action error */}
        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-20">
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
                placeholder="Search by customer or service..."
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All statuses</option>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Empty */}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
                <p className="text-sm">
                  {subscriptions.length === 0
                    ? 'No subscriptions yet. Close a deal by clicking + New Subscription.'
                    : 'No subscriptions match your filter.'}
                </p>
              </div>
            )}

            {/* Table */}
            {filtered.length > 0 && (
              <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                      <Th>Customer</Th>
                      <Th>Service</Th>
                      <Th>Price</Th>
                      <Th>Status</Th>
                      <Th>Start</Th>
                      <Th>Expiry</Th>
                      <Th>Days Left</Th>
                      <Th>Invoice</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((sub) => {
                      const days = daysUntil(sub.expiryDate);
                      const isActive = sub.status === 'Active' || sub.status === 'Renewed';
                      return (
                        <tr key={sub.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                            {customerLabel(sub)}
                          </td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{serviceLabel(sub)}</td>
                          <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                            ${sub.servicePrice.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <SubStatusBadge status={sub.status} />
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmt(sub.startDate)}</td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={days < 0 ? 'text-red-600 font-medium' : days <= 7 ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                              {fmt(sub.expiryDate)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-center">
                            {isActive ? (
                              <span className={`text-xs font-bold ${days < 0 ? 'text-red-600' : days <= 7 ? 'text-orange-500' : days <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                                {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                              </span>
                            ) : <span className="text-gray-300">-</span>}
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                            {invoiceLabel(sub) ?? '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {confirmId === sub.id ? (
                              <span className="flex items-center gap-2 text-xs">
                                <span className="text-gray-600">Cancel?</span>
                                <button onClick={() => handleCancel(sub.id)} className="text-red-600 font-medium hover:underline">Yes</button>
                                <button onClick={() => setConfirmId(null)} className="text-gray-500 hover:underline">No</button>
                              </span>
                            ) : (
                              <span className="flex items-center gap-3">
                                {isActive && (
                                  <button
                                    onClick={() => setModal({ type: 'renew', sub })}
                                    className="text-xs font-medium text-green-600 hover:text-green-800 transition-colors"
                                  >
                                    Renew
                                  </button>
                                )}
                                {(sub.status === 'Active' || sub.status === 'Renewed') && (
                                  <button
                                    onClick={() => setConfirmId(sub.id)}
                                    className="text-xs font-medium text-red-400 hover:text-red-700 transition-colors"
                                  >
                                    Cancel
                                  </button>
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
                {filtered.length} of {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {modal?.type === 'create' && (
        <CreateSubscriptionModal onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'renew' && (
        <RenewModal
          subscription={modal.sub}
          onSubmit={(p) => handleRenew(modal.sub.id, p)}
          onClose={() => setModal(null)}
        />
      )}
    </AppShell>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}
