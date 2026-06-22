import { useEffect, useRef, useState } from 'react';
import RichTextEditor from './RichTextEditor';
import VariablePicker from './VariablePicker';
import {
  TEMPLATE_TYPE_LABELS,
  TEMPLATE_TYPES,
  type EmailTemplate,
  type TemplatePayload,
  type TemplateType,
} from './emailTemplatesApi';
import { extractApiError } from './useEmailTemplates';

interface Props {
  initial?: EmailTemplate | null;
  onSave: (payload: TemplatePayload) => Promise<void>;
  onClose: () => void;
}

const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const LABEL = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1';

export default function TemplateModal({ initial, onSave, onClose }: Props) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<TemplateType>(initial?.type ?? 'custom');
  const [subject, setSubject] = useState(initial?.subject ?? '');
  const [bodyHtml, setBodyHtml] = useState(initial?.bodyHtml ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);

  // Subject cursor position for variable insertion
  const subjectCursorRef = useRef<number | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim())        { setError('Template name is required.'); nameRef.current?.focus(); return; }
    if (!subject.trim())     { setError('Subject is required.'); subjectRef.current?.focus(); return; }
    if (!bodyHtml.trim() || bodyHtml === '<p></p>') { setError('Body cannot be empty.'); return; }

    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), type, subject: subject.trim(), bodyHtml });
      onClose();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  }

  /** Insert a variable token into the subject field at the last cursor position */
  function insertSubjectVariable(token: string) {
    const el = subjectRef.current;
    if (!el) { setSubject((s) => s + token); return; }
    const pos = subjectCursorRef.current ?? subject.length;
    const next = subject.slice(0, pos) + token + subject.slice(pos);
    setSubject(next);
    const newPos = pos + token.length;
    subjectCursorRef.current = newPos;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(newPos, newPos);
    });
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-40 flex"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Dark overlay */}
      <div className="fixed inset-0 bg-black/30" aria-hidden />

      {/* Panel — slides in from the right */}
      <aside className="relative ml-auto flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {initial ? 'Edit Template' : 'New Template'}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Use <code className="bg-gray-100 px-1 rounded text-[11px]">{'{variable}'}</code> tokens — they're replaced when the email is sent.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Scrollable body */}
        <form
          id="template-form"
          onSubmit={handleSubmit}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {/* Error banner */}
          {error && (
            <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-3 text-red-400 hover:text-red-600 shrink-0"
              >✕</button>
            </div>
          )}

          {/* Name + Type row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>Template Name *</label>
              <input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={INPUT}
                placeholder="e.g. Welcome Email"
                maxLength={100}
              />
            </div>
            <div>
              <label className={LABEL}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TemplateType)}
                className={INPUT}
              >
                {TEMPLATE_TYPES.map((t) => (
                  <option key={t} value={t}>{TEMPLATE_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Subject */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL}>Subject *</label>
              <VariablePicker
                editor={null}
                onInsertText={insertSubjectVariable}
              />
            </div>
            <input
              ref={subjectRef}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onBlur={(e) => { subjectCursorRef.current = e.target.selectionStart; }}
              onClick={(e) => { subjectCursorRef.current = (e.target as HTMLInputElement).selectionStart; }}
              onKeyUp={(e) => { subjectCursorRef.current = (e.target as HTMLInputElement).selectionStart; }}
              className={INPUT}
              placeholder="e.g. Hi {customer_name}, here's your invoice"
              maxLength={200}
            />
          </div>

          {/* Body */}
          <div>
            <label className={LABEL}>Body *</label>
            <p className="text-xs text-gray-400 mb-2">
              Use the toolbar to format text, insert images, add a CTA button, or pick a variable. Variables are highlighted as plain text and replaced at send time.
            </p>
            <RichTextEditor
              value={bodyHtml}
              onChange={setBodyHtml}
              placeholder="Write your email body…"
            />
          </div>

          {/* Preview note */}
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
            <strong>Variables available:</strong>{' '}
            <code className="bg-amber-100 rounded px-1">{'{customer_name}'}</code>{' '}
            <code className="bg-amber-100 rounded px-1">{'{shop_name}'}</code>{' '}
            <code className="bg-amber-100 rounded px-1">{'{salesperson_name}'}</code>{' '}
            <code className="bg-amber-100 rounded px-1">{'{invoice_amount}'}</code>{' '}
            <code className="bg-amber-100 rounded px-1">{'{service_name}'}</code>{' '}
            <code className="bg-amber-100 rounded px-1">{'{expiry_date}'}</code>
          </div>
        </form>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center justify-end gap-3 bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="template-form"
            disabled={submitting}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors min-w-[90px]"
          >
            {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create'}
          </button>
        </div>
      </aside>
    </div>
  );
}
