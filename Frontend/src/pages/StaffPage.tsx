import { useState } from 'react';
import AppShell from '../components/AppShell';
import { useStaff } from '../features/staff/useStaff';
import StaffForm from '../features/staff/StaffForm';
import StaffPermissionsPanel from '../features/staff/StaffPermissionsPanel';
import type { StaffMember, CreateStaffPayload, UpdateStaffPayload } from '../features/staff/staffApi';

type Modal =
  | { type: 'create' }
  | { type: 'edit'; member: StaffMember }
  | null;

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

// Shield icon for permissions button
function ShieldIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  );
}

export default function StaffPage() {
  const { staff, loading, error, reload, create, update, remove } = useStaff();
  const [modal,       setModal]       = useState<Modal>(null);
  const [permsMember, setPermsMember] = useState<StaffMember | null>(null);
  const [confirmId,   setConfirmId]   = useState<string | null>(null);
  const [actionErr,   setActionErr]   = useState<string | null>(null);
  const [search,      setSearch]      = useState('');

  function extractError(err: unknown) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })
      ?.response?.data?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Action failed.');
  }

  async function handleCreate(payload: CreateStaffPayload | UpdateStaffPayload) {
    await create(payload as CreateStaffPayload);
  }

  async function handleUpdate(id: string, payload: CreateStaffPayload | UpdateStaffPayload) {
    await update(id, payload as UpdateStaffPayload);
  }

  async function handleRemove(id: string) {
    setConfirmId(null);
    setActionErr(null);
    try { await remove(id); }
    catch (err) { setActionErr(extractError(err)); }
  }

  const filtered = staff.filter((m) => {
    const q = search.toLowerCase();
    return !q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q);
  });

  return (
    <AppShell title="Staff">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Staff</h2>
            <p className="text-sm text-gray-500 mt-0.5">Manage salesperson accounts and their permissions</p>
          </div>
          <button
            onClick={() => setModal({ type: 'create' })}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + Add Staff Member
          </button>
        </div>

        {/* Owner notice */}
        <div className="flex items-start gap-2.5 rounded-lg bg-blue-50 border border-blue-200 px-4 py-3">
          <svg className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-blue-800 leading-relaxed">
            <span className="font-semibold">As owner, you always have full access</span> to everything. Use the shield (🛡) button on each staff card to control what each salesperson can do. The backend enforces all permission checks — UI visibility is a convenience only.
          </p>
        </div>

        {/* Action error */}
        {actionErr && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionErr}
            <button onClick={() => setActionErr(null)} className="ml-4 text-red-400 hover:text-red-600">✕</button>
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
            {/* Search */}
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />

            {/* Empty state */}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
                <p className="text-sm">
                  {staff.length === 0
                    ? 'No staff members yet. Add a salesperson to get started.'
                    : 'No staff match your search.'}
                </p>
              </div>
            )}

            {/* Staff cards */}
            {filtered.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((member) => (
                  <div key={member.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <div className="flex items-start justify-between gap-4">
                      {/* Avatar + info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm shrink-0">
                          {member.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{member.fullName}</p>
                          <p className="text-sm text-gray-500 truncate">{member.email}</p>
                          <p className="text-xs text-gray-400 mt-0.5">Joined {fmt(member.createdAt)}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Permissions */}
                        <button
                          onClick={() => setPermsMember(member)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit permissions"
                        >
                          <ShieldIcon />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => setModal({ type: 'edit', member })}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>

                        {/* Remove / confirm */}
                        {confirmId === member.id ? (
                          <span className="flex items-center gap-1 text-xs">
                            <button onClick={() => handleRemove(member.id)} className="text-red-600 font-medium hover:underline px-1">Remove</button>
                            <button onClick={() => setConfirmId(null)} className="text-gray-400 hover:underline px-1">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setConfirmId(member.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Remove"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Permissions summary chips */}
                    {member.permissions && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {(Object.entries(member.permissions) as [string, boolean][])
                          .filter(([, v]) => v)
                          .map(([k]) => (
                            <span key={k} className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-medium">
                              {permLabel(k)}
                            </span>
                          ))}
                        {Object.values(member.permissions).every((v) => !v) && (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs">No extra permissions</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {filtered.length > 0 && (
              <p className="text-xs text-gray-400 text-right">
                {filtered.length} of {staff.length} staff member{staff.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/* Create / Edit modal */}
      {modal?.type === 'create' && (
        <StaffForm onSubmit={handleCreate} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'edit' && (
        <StaffForm
          member={modal.member}
          onSubmit={(p) => handleUpdate(modal.member.id, p)}
          onClose={() => setModal(null)}
        />
      )}

      {/* Permissions slide-over */}
      {permsMember && (
        <StaffPermissionsPanel
          member={permsMember}
          onClose={() => setPermsMember(null)}
        />
      )}
    </AppShell>
  );
}

// Short human label for permission chips on the card
function permLabel(key: string): string {
  const map: Record<string, string> = {
    viewAllCustomers:    'View All Customers',
    manageCustomers:     'Manage Customers',
    sendEmail:           'Send Email',
    manageEmailTemplates:'Email Templates',
    createInvoice:       'Invoices',
    exportInvoicePdf:    'Invoice PDF',
    manageServices:      'Services',
    viewReports:         'Reports',
    exportExcel:         'Export Excel',
    importData:          'Import Data',
    manageStaff:         'Manage Staff',
  };
  return map[key] ?? key;
}
