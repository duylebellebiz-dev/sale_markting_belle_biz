import { useEffect, useRef, useState } from 'react';
import { PIPELINE_STAGES, PIPELINE_STAGE_LABELS, type Customer, type CustomerPayload, type StaffUser } from './customersApi';

interface Props {
  initial?: Customer | null;
  staff: StaffUser[];
  isOwner: boolean;
  onSubmit: (payload: CustomerPayload) => Promise<void>;
  onClose: () => void;
}

const SOURCES = ['Facebook Ads', 'Google Ads', 'Referral', 'Friend', 'Walk-in', 'Other'];

const EMPTY: CustomerPayload = {
  customerName: '',
  assignedTo: '',
  shopName: '',
  shopAddress: '',
  email: '',
  phoneNumber: '',
  shopPhoneNumber: '',
  contactSource: '',
  dateOfContact: '',
  stage: 'Lead',
  status: '',
  note: '',
  nextFollowUpAt: '',
};

function toFormDate(iso?: string) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function toLocalDatetime(iso?: string) {
  if (!iso) return '';
  // datetime-local input expects YYYY-MM-DDTHH:MM
  return iso.slice(0, 16);
}

export default function CustomerForm({ initial, staff, isOwner, onSubmit, onClose }: Props) {
  const [form, setForm] = useState<CustomerPayload>(() =>
    initial
      ? {
          customerName: initial.customerName,
          assignedTo:
            typeof initial.assignedTo === 'object' ? initial.assignedTo.id : initial.assignedTo,
          shopName: initial.shopName ?? '',
          shopAddress: initial.shopAddress ?? '',
          email: initial.email ?? '',
          phoneNumber: initial.phoneNumber ?? '',
          shopPhoneNumber: initial.shopPhoneNumber ?? '',
          contactSource: initial.contactSource ?? '',
          dateOfContact: toFormDate(initial.dateOfContact),
          stage: initial.stage,
          status: initial.status ?? '',
          note: initial.note ?? '',
          nextFollowUpAt: toLocalDatetime(initial.nextFollowUpAt),
        }
      : EMPTY,
  );

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  function set<K extends keyof CustomerPayload>(field: K, value: CustomerPayload[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      // Convert empty strings to undefined so backend ignores them
      const payload: CustomerPayload = {
        ...form,
        assignedTo: form.assignedTo || undefined,
        shopName: form.shopName || undefined,
        shopAddress: form.shopAddress || undefined,
        email: form.email || undefined,
        phoneNumber: form.phoneNumber || undefined,
        shopPhoneNumber: form.shopPhoneNumber || undefined,
        contactSource: form.contactSource || undefined,
        dateOfContact: form.dateOfContact || undefined,
        status: form.status || undefined,
        note: form.note || undefined,
        nextFollowUpAt: form.nextFollowUpAt ? new Date(form.nextFollowUpAt).toISOString() : undefined,
      };
      await onSubmit(payload);
      onClose();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string | string[] } } }).response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {initial ? 'Edit Customer' : 'Add Customer'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Customer Name *">
              <input
                ref={firstRef}
                value={form.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                className={INPUT}
                placeholder="Full name"
              />
            </Field>

            <Field label="Shop / Business Name">
              <input
                value={form.shopName}
                onChange={(e) => set('shopName', e.target.value)}
                className={INPUT}
                placeholder="Shop name"
              />
            </Field>
          </div>

          <Field label="Shop Address">
            <input
              value={form.shopAddress}
              onChange={(e) => set('shopAddress', e.target.value)}
              className={INPUT}
              placeholder="Street, City, Province, Postal Code"
              maxLength={300}
            />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                className={INPUT}
                placeholder="customer@example.com"
              />
            </Field>

            <Field label="Phone Number">
              <input
                value={form.phoneNumber}
                onChange={(e) => set('phoneNumber', e.target.value)}
                className={INPUT}
                placeholder="+1 555 000 0000"
              />
            </Field>

            <Field label="Shop Phone">
              <input
                value={form.shopPhoneNumber}
                onChange={(e) => set('shopPhoneNumber', e.target.value)}
                className={INPUT}
                placeholder="Shop landline"
              />
            </Field>

            <Field label="Contact Source">
              <select value={form.contactSource} onChange={(e) => set('contactSource', e.target.value)} className={INPUT}>
                <option value="">- Select -</option>
                {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>

            <Field label="Date of Contact">
              <input
                type="date"
                value={form.dateOfContact}
                onChange={(e) => set('dateOfContact', e.target.value)}
                className={INPUT}
              />
            </Field>

            <Field label="Pipeline Stage">
              <select value={form.stage} onChange={(e) => set('stage', e.target.value as CustomerPayload['stage'])} className={INPUT}>
                {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{PIPELINE_STAGE_LABELS[s]}</option>)}
              </select>
            </Field>

            <Field label="Status (free text)">
              <input
                value={form.status}
                onChange={(e) => set('status', e.target.value)}
                className={INPUT}
                placeholder="e.g. Interested, Thinking..."
              />
            </Field>

            <Field label="Next Follow-up At">
              <input
                type="datetime-local"
                value={form.nextFollowUpAt}
                onChange={(e) => set('nextFollowUpAt', e.target.value)}
                className={INPUT}
              />
            </Field>

            {isOwner && (
              <Field label="Assign To">
                <select value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)} className={INPUT}>
                  <option value="">- Assign to salesperson -</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.fullName || s.email}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>

          <Field label="Notes">
            <textarea
              value={form.note}
              onChange={(e) => set('note', e.target.value)}
              className={`${INPUT} h-24 resize-none`}
              placeholder="Follow-up notes, context..."
            />
          </Field>
        </form>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} type="button" className={BTN_SECONDARY}>Cancel</button>
          <button
            onClick={handleSubmit as unknown as React.MouseEventHandler}
            disabled={submitting}
            className={BTN_PRIMARY}
          >
            {submitting ? 'Saving...' : initial ? 'Save Changes' : 'Add Customer'}
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

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent';
const BTN_PRIMARY = 'px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors';
const BTN_SECONDARY = 'px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors';
