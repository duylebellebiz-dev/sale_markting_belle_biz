import { useEffect, useRef, useState } from 'react';
import type { StaffMember, CreateStaffPayload, UpdateStaffPayload } from './staffApi';

interface Props {
  member?: StaffMember;
  onSubmit: (payload: CreateStaffPayload | UpdateStaffPayload) => Promise<void>;
  onClose: () => void;
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

export default function StaffForm({ member, onSubmit, onClose }: Props) {
  const isEdit = !!member;
  const [fullName,   setFullName]   = useState(member?.fullName ?? '');
  const [email,      setEmail]      = useState(member?.email ?? '');
  const [password,   setPassword]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) { setError('Full name is required.'); return; }
    if (!email.trim())    { setError('Email is required.'); return; }
    if (!isEdit && !password) { setError('Password is required.'); return; }
    if (password && password.length < 8) { setError('Password must be at least 8 characters.'); return; }

    setSubmitting(true);
    try {
      const payload: CreateStaffPayload | UpdateStaffPayload = {
        fullName: fullName.trim(),
        email:    email.trim(),
        ...(password ? { password } : {}),
      };
      await onSubmit(payload);
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Full Name *</label>
            <input ref={firstRef} value={fullName} onChange={(e) => setFullName(e.target.value)}
              className={INPUT} placeholder="Jane Smith" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              className={INPUT} placeholder="jane@company.com" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Password {isEdit ? '(leave blank to keep current)' : '* (min. 8 characters)'}
            </label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className={INPUT} placeholder={isEdit ? 'New password (optional, min. 8 chars)' : 'At least 8 characters'} />
          </div>
        </form>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={submitting}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Staff Member'}
          </button>
        </div>
      </div>
    </div>
  );
}
