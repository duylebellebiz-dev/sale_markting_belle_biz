import { useEffect, useRef, useState } from 'react';
import { staffApi } from './staffApi';
import type { UserPermissions, StaffMember } from './staffApi';

interface PermissionDef {
  key: keyof UserPermissions;
  label: string;
  description: string;
  group: string;
}

const PERMISSION_DEFS: PermissionDef[] = [
  // Customers
  {
    key: 'manageCustomers',
    label: 'Manage Customers',
    description: 'Add, edit, and delete customer records.',
    group: 'Customers',
  },
  {
    key: 'viewAllCustomers',
    label: 'View All Customers',
    description: "See every customer in the business, not just their own assigned ones.",
    group: 'Customers',
  },
  // Invoices
  {
    key: 'createInvoice',
    label: 'Create & Edit Invoices',
    description: 'Create, edit, and manage invoice lifecycle (mark sent, paid, cancel).',
    group: 'Invoices',
  },
  {
    key: 'exportInvoicePdf',
    label: 'Export Invoice PDF',
    description: 'Download invoices as PDF files.',
    group: 'Invoices',
  },
  // Email
  {
    key: 'sendEmail',
    label: 'Send Emails',
    description: 'Compose and send email campaigns to customers.',
    group: 'Email',
  },
  {
    key: 'manageEmailTemplates',
    label: 'Manage Email Templates',
    description: 'Create, edit, and delete reusable email templates.',
    group: 'Email',
  },
  // Services
  {
    key: 'manageServices',
    label: 'Manage Services',
    description: 'Add, edit, and remove services from the catalog.',
    group: 'Services',
  },
  // Reports & Data
  {
    key: 'viewReports',
    label: 'View Reports',
    description: 'Access the dashboard and analytics reports.',
    group: 'Reports & Data',
  },
  {
    key: 'exportExcel',
    label: 'Export to Excel',
    description: 'Download customer and data lists as Excel files.',
    group: 'Reports & Data',
  },
  {
    key: 'importData',
    label: 'Import Data',
    description: 'Upload and import customers from Excel or CSV files.',
    group: 'Reports & Data',
  },
  // AI
  {
    key: 'analyzeAds',
    label: 'Analyze Ad Campaigns',
    description: 'Connect ad accounts and run AI campaign analysis using the shared Claude API key.',
    group: 'AI',
  },
  // Admin
  {
    key: 'manageStaff',
    label: 'Manage Staff',
    description: 'View and manage other staff accounts. Assign with caution.',
    group: 'Admin',
  },
];

const GROUPS = ['Customers', 'Invoices', 'Email', 'Services', 'Reports & Data', 'AI', 'Admin'];

interface Props {
  member: StaffMember;
  onClose: () => void;
}

export default function StaffPermissionsPanel({ member, onClose }: Props) {
  const [perms, setPerms] = useState<UserPermissions | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load current permissions
  useEffect(() => {
    setLoadErr(null);
    staffApi
      .getPermissions(member.id)
      .then((res) => setPerms(res.permissions))
      .catch(() => setLoadErr('Failed to load permissions. Please try again.'));
  }, [member.id]);

  // Trap focus inside panel when open
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  // Close on backdrop click
  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function toggle(key: keyof UserPermissions) {
    setPerms((prev) => prev ? { ...prev, [key]: !prev[key] } : prev);
    setSaved(false);
  }

  async function handleSave() {
    if (!perms) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const updated = await staffApi.updatePermissions(member.id, perms);
      setPerms(updated.permissions);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setSaveErr(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to save. Please try again.'));
    } finally {
      setSaving(false);
    }
  }

  const initials = member.fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={handleBackdrop}
      aria-modal="true"
      role="dialog"
      aria-label={`Permissions for ${member.fullName}`}
    >
      {/* Slide-over panel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col h-full outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-semibold text-sm shrink-0">
              {initials}
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{member.fullName}</h2>
              <p className="text-xs text-gray-500">{member.email}</p>
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium capitalize">
                {member.role}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-2xl leading-none ml-4 mt-0.5 shrink-0"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Owner notice */}
        <div className="mx-6 mt-4 shrink-0 flex items-start gap-2.5 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <svg className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <p className="text-xs text-amber-800 leading-relaxed">
            <span className="font-semibold">Owners always have full access</span> and are not affected by these flags. These settings only restrict or expand what this salesperson can do. The backend enforces all checks — hiding a button is a UX hint only.
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Loading */}
          {!perms && !loadErr && (
            <div className="flex justify-center py-16">
              <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
          )}

          {/* Load error */}
          {loadErr && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 text-center mt-4">
              {loadErr}
            </div>
          )}

          {/* Permission groups */}
          {perms && GROUPS.map((group) => {
            const items = PERMISSION_DEFS.filter((d) => d.group === group);
            return (
              <div key={group} className="mb-6">
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                  {group}
                </h3>
                <div className="space-y-1">
                  {items.map(({ key, label, description }) => {
                    const enabled = perms[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggle(key)}
                        className={[
                          'w-full text-left flex items-start gap-4 px-4 py-3 rounded-lg border transition-colors',
                          enabled
                            ? 'border-indigo-200 bg-indigo-50'
                            : 'border-gray-200 bg-white hover:bg-gray-50',
                        ].join(' ')}
                      >
                        {/* Toggle knob */}
                        <div className="mt-0.5 shrink-0">
                          <div
                            className={[
                              'relative w-9 h-5 rounded-full transition-colors duration-200',
                              enabled ? 'bg-indigo-600' : 'bg-gray-300',
                            ].join(' ')}
                          >
                            <span
                              className={[
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                                enabled ? 'translate-x-4' : 'translate-x-0.5',
                              ].join(' ')}
                            />
                          </div>
                        </div>
                        {/* Text */}
                        <div>
                          <p className={`text-sm font-medium ${enabled ? 'text-indigo-900' : 'text-gray-700'}`}>
                            {label}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 px-6 py-4 flex items-center justify-between gap-3">
          <div className="text-sm">
            {saved && (
              <span className="flex items-center gap-1.5 text-green-600 font-medium">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Saved — takes effect on next salesperson action
              </span>
            )}
            {saveErr && (
              <span className="text-red-600 text-xs">{saveErr}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              type="button"
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Close
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !perms}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-w-[100px]"
            >
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
