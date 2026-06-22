import { useState } from 'react';
import AppShell from '../components/AppShell';
import api from '../lib/api';
import { useCustomers } from '../features/customers/useCustomers';
import CustomerTable from '../features/customers/CustomerTable';
import CustomerForm from '../features/customers/CustomerForm';
import FollowUpModal from '../features/customers/FollowUpModal';
import CustomerEmailHistoryModal from '../features/email/CustomerEmailHistoryModal';
import { usePermission } from '../features/staff/usePermission';
import type { Customer, CustomerPayload } from '../features/customers/customersApi';

type Modal =
  | { type: 'add' }
  | { type: 'edit'; customer: Customer }
  | { type: 'followup'; customer: Customer }
  | { type: 'emailHistory'; customer: Customer }
  | null;

export default function CustomersPage() {
  const canManage   = usePermission('manageCustomers');
  const canExport   = usePermission('exportExcel');
  const { customers, staff, loading, error, isOwner, reload, create, update, remove, scheduleFollowUp } =
    useCustomers();
  const [modal, setModal] = useState<Modal>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [exporting,   setExporting]   = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/export/customers', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'customers.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setActionError('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  async function handleFormSubmit(payload: CustomerPayload) {
    setActionError(null);
    if (modal?.type === 'edit') {
      await update(modal.customer.id, payload);
    } else {
      await create(payload);
    }
  }

  async function handleDelete(c: Customer) {
    setActionError(null);
    try {
      await remove(c.id);
    } catch {
      setActionError(`Failed to delete "${c.customerName}".`);
    }
  }

  async function handleFollowUp(nextFollowUpAt: string, note?: string) {
    if (modal?.type !== 'followup') return;
    await scheduleFollowUp(modal.customer.id, nextFollowUpAt, note);
  }

  return (
    <AppShell title="Customers">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Header row */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Customers</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {isOwner ? 'All customers across your business' : 'Your assigned customers'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canExport && (
              <button
                onClick={handleExport}
                disabled={exporting}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {exporting ? 'Exporting...' : 'Export .xlsx'}
              </button>
            )}
            {canManage && (
              <button
                onClick={() => setModal({ type: 'add' })}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
              >
                + Add Customer
              </button>
            )}
          </div>
        </div>

        {/* Action-level error */}
        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 ml-4"></button>
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
            <button
              onClick={reload}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && !error && (
          <CustomerTable
            customers={customers}
            isOwner={isOwner}
            onEdit={(c) => setModal({ type: 'edit', customer: c })}
            onDelete={handleDelete}
            onFollowUp={(c) => setModal({ type: 'followup', customer: c })}
            onEmailHistory={(c) => setModal({ type: 'emailHistory', customer: c })}
          />
        )}
      </div>

      {/* Add / Edit modal */}
      {(modal?.type === 'add' || modal?.type === 'edit') && (
        <CustomerForm
          initial={modal.type === 'edit' ? modal.customer : null}
          staff={staff}
          isOwner={isOwner}
          onSubmit={handleFormSubmit}
          onClose={() => setModal(null)}
        />
      )}

      {/* Follow-up modal */}
      {modal?.type === 'followup' && (
        <FollowUpModal
          customer={modal.customer}
          onSubmit={handleFollowUp}
          onClose={() => setModal(null)}
        />
      )}

      {/* Email History modal */}
      {modal?.type === 'emailHistory' && (
        <CustomerEmailHistoryModal
          customerId={modal.customer.id}
          customerName={modal.customer.customerName}
          onClose={() => setModal(null)}
        />
      )}
    </AppShell>
  );
}
