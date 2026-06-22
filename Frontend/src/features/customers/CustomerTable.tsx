import { useState } from 'react';
import type { Customer } from './customersApi';
import StageBadge from './StageBadge';

interface Props {
  customers: Customer[];
  isOwner: boolean;
  onEdit: (c: Customer) => void;
  onDelete: (c: Customer) => void;
  onFollowUp: (c: Customer) => void;
  onEmailHistory?: (c: Customer) => void;
}

function assigneeName(c: Customer) {
  if (typeof c.assignedTo === 'object') return c.assignedTo.fullName || c.assignedTo.email;
  return '-';
}

function fmtDate(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtDatetime(iso?: string) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function CustomerTable({ customers, isOwner, onEdit, onDelete, onFollowUp, onEmailHistory }: Props) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = customers.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.customerName.toLowerCase().includes(q) ||
      (c.shopName ?? '').toLowerCase().includes(q) ||
      (c.shopAddress ?? '').toLowerCase().includes(q) ||
      (c.phoneNumber ?? '').includes(q) ||
      (c.email ?? '').toLowerCase().includes(q);
    const matchStage = !stageFilter || c.stage === stageFilter;
    return matchSearch && matchStage;
  });

  function confirmDelete(c: Customer) {
    setDeletingId(c.id);
  }

  function cancelDelete() {
    setDeletingId(null);
  }

  function executeDelete(c: Customer) {
    setDeletingId(null);
    onDelete(c);
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
        <p className="text-sm">No customers yet. Click <strong>Add Customer</strong> to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, shop, address, phone, email..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All stages</option>
          {['Lead','Contacted','Interested','Proposal Sent','Negotiation','Closed Won','Closed Lost'].map(
            (s) => <option key={s} value={s}>{s}</option>,
          )}
        </select>
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-gray-400 text-center py-8">No customers match your filter.</p>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <Th>Customer</Th>
                <Th>Stage</Th>
                <Th>Status</Th>
                {isOwner && <Th>Assigned To</Th>}
                <Th>Phone</Th>
                <Th>Next Follow-up</Th>
                <Th>Notes</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => (
                <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.isClosed ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900 whitespace-nowrap">{c.customerName}</p>
                    {c.shopName && <p className="text-xs text-gray-500 whitespace-nowrap">{c.shopName}</p>}
                    {c.shopAddress && (
                      <p className="text-xs text-gray-400 max-w-[220px] leading-snug">{c.shopAddress}</p>
                    )}
                    {c.email && <p className="text-xs text-gray-400 whitespace-nowrap">{c.email}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StageBadge stage={c.stage} />
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{c.status || '-'}</td>
                  {isOwner && (
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{assigneeName(c)}</td>
                  )}
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {c.phoneNumber || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {c.nextFollowUpAt ? (
                      <span
                        className={
                          new Date(c.nextFollowUpAt) < new Date() && !c.isClosed
                            ? 'text-red-600 font-medium'
                            : 'text-gray-600'
                        }
                      >
                        {fmtDatetime(c.nextFollowUpAt)}
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 max-w-[200px]">
                    <p className="text-gray-500 text-xs line-clamp-2">{c.note || '-'}</p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {deletingId === c.id ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-gray-600">Delete?</span>
                        <button
                          onClick={() => executeDelete(c)}
                          className="text-red-600 font-medium hover:underline"
                        >Yes</button>
                        <button onClick={cancelDelete} className="text-gray-500 hover:underline">No</button>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <ActionBtn onClick={() => onEdit(c)}>Edit</ActionBtn>
                        {!c.isClosed && (
                          <ActionBtn onClick={() => onFollowUp(c)} accent>Follow-up</ActionBtn>
                        )}
                        {onEmailHistory && (
                          <ActionBtn onClick={() => onEmailHistory(c)}>History</ActionBtn>
                        )}
                        <ActionBtn onClick={() => confirmDelete(c)} danger>Delete</ActionBtn>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400 text-right">
        {filtered.length} of {customers.length} customer{customers.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 text-left font-medium">{children}</th>;
}

function ActionBtn({
  children,
  onClick,
  danger,
  accent,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
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
