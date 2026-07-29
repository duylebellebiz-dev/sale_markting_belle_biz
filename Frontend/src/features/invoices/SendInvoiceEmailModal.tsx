/**
 * Modal for sending an invoice by email (S12.3b).
 *
 * The user can:
 *   1. Pick a saved email template -> subject + body are auto-filled with
 *      invoice variables rendered in the browser for instant preview.
 *   2. Write a completely custom subject + body.
 *
 * On confirm, the final (possibly edited) subject + body are sent as
 * customSubject / customBodyHtml so the backend uses them verbatim.
 * The PDF is always generated and attached server-side.
 */
import { useEffect, useRef, useState } from 'react';
import type { Invoice } from './invoicesApi';
import { invoicesApi } from './invoicesApi';
import { emailTemplatesApi } from '../email/emailTemplatesApi';
import type { EmailTemplate } from '../email/emailTemplatesApi';
import { businessesApi } from '../businesses/businessesApi';
import { savedEmailsApi } from '../businesses/savedEmailsApi';
import { DEFAULT_INVOICE_CC, DEFAULT_INVOICE_BCC } from './invoiceEmailDefaults';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function invalidEmails(raw: string): string[] {
  return raw.split(',').map((e) => e.trim()).filter((e) => e && !EMAIL_RE.test(e));
}

/** Appends an email to a comma-separated list field, avoiding duplicates. */
function addEmailToList(current: string, email: string): string {
  const existing = current.split(',').map((e) => e.trim()).filter(Boolean);
  if (existing.some((e) => e.toLowerCase() === email.toLowerCase())) return current;
  return [...existing, email].join(', ');
}

//  Variable rendering

function renderVars(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

function buildVars(inv: Invoice, businessName: string): Record<string, string> {
  const customerObj = inv.customer ?? (typeof inv.customerId === 'object' ? inv.customerId : null);
  return {
    customer_name:    inv.billTo?.name || customerObj?.customerName || 'Valued Customer',
    shop_name:        customerObj?.shopName || '',
    invoice_amount:   `$${(Number(inv.total) || 0).toFixed(2)}`,
    balance_due:      `$${(Number(inv.balanceDue) || 0).toFixed(2)}`,
    service_name:     inv.lineItems?.[0]?.description || '',
    expiry_date:      '',
    salesperson_name: '',
    invoice_number:   inv.invoiceNumber || '',
    business_name:    businessName,
  };
}

//  Styles 

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

//  Props 

interface Props {
  invoice: Invoice;
  onClose: () => void;
  onSent: () => void;
}

//  Component 

export default function SendInvoiceEmailModal({ invoice, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTpls, setLoadingTpls] = useState(true);

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [businessName, setBusinessName] = useState('');

  const [additionalTo, setAdditionalTo] = useState('');
  const [cc, setCc] = useState(DEFAULT_INVOICE_CC);
  const [bcc, setBcc] = useState(DEFAULT_INVOICE_BCC);
  const [savedEmails, setSavedEmails] = useState<string[]>([]);

  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const vars = buildVars(invoice, businessName);
  const recipientEmail =
    invoice.billTo?.email ||
    invoice.customer?.email ||
    (typeof invoice.customerId === 'object' ? (invoice.customerId as any).email : '') ||
    '';

  const firstRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  // Load templates on mount
  useEffect(() => {
    emailTemplatesApi.list()
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpls(false));
  }, []);

  // Load business name on mount (needed for the {business_name} variable)
  useEffect(() => {
    businessesApi.getMe()
      .then((res) => setBusinessName(res.businessName))
      .catch(() => {});
  }, []);

  // Load saved quick-pick CC/BCC emails on mount
  useEffect(() => {
    savedEmailsApi.list().then(setSavedEmails).catch(() => setSavedEmails([]));
  }, []);

  // When a template is chosen, auto-fill subject + body with rendered vars
  function onTemplateChange(id: string) {
    setSelectedTemplateId(id);
    if (!id) return; // 'Custom message' - keep whatever user typed
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(renderVars(tpl.subject, vars));
    setBodyHtml(renderVars(tpl.bodyHtml, vars));
    setTab('edit');
  }

  async function handleSend() {
    if (!recipientEmail) {
      setError('This customer has no email address. Add one to the customer record first.');
      return;
    }
    if (!subject.trim()) { setError('Subject is required.'); return; }
    const badTo = invalidEmails(additionalTo);
    if (badTo.length) { setError(`Invalid recipient address(es): ${badTo.join(', ')}`); return; }
    const badCc = invalidEmails(cc);
    if (badCc.length) { setError(`Invalid CC address(es): ${badCc.join(', ')}`); return; }
    const badBcc = invalidEmails(bcc);
    if (badBcc.length) { setError(`Invalid BCC address(es): ${badBcc.join(', ')}`); return; }
    setError(null);
    setSending(true);
    try {
      await invoicesApi.sendEmail(invoice.id, {
        templateId:    selectedTemplateId || undefined,
        customSubject: subject.trim(),
        customBodyHtml: bodyHtml.trim() || undefined,
        additionalTo:  additionalTo.trim() || undefined,
        cc:            cc.trim() || undefined,
        bcc:           bcc.trim() || undefined,
      });
      onSent();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })
        ?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to send email.'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Send Invoice by Email</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Invoice #{invoice.invoiceNumber} - PDF attached automatically
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600 mt-0.5"></button>
            </div>
          )}

          {/* Recipient */}
          <div>
            <p className={LABEL}>To</p>
            {recipientEmail ? (
              <p className="text-sm text-gray-800 bg-gray-50 rounded-lg border border-gray-200 px-3 py-2">
                {recipientEmail}
              </p>
            ) : (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg border border-red-200 px-3 py-2">
                No email address on file - add one to the customer record before sending.
              </p>
            )}
          </div>

          {/* Additional To */}
          <div>
            <label className={LABEL}>Additional Recipients (optional)</label>
            <input
              value={additionalTo}
              onChange={(e) => setAdditionalTo(e.target.value)}
              className={INPUT}
              placeholder="another@example.com, manager@example.com"
            />
          </div>

          {/* CC / BCC */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={LABEL}>CC (optional)</label>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className={INPUT}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className={LABEL}>BCC (optional)</label>
              <input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className={INPUT}
                placeholder="audit@example.com"
              />
            </div>
          </div>

          {/* Saved quick-pick emails */}
          {savedEmails.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 -mt-1">
              <span className="text-xs text-gray-400 mr-1">Quick add:</span>
              {savedEmails.map((email) => (
                <div key={email} className="inline-flex rounded-full border border-gray-200 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setCc((v) => addEmailToList(v, email))}
                    title={`Add ${email} to CC`}
                    className="px-2 py-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors border-r border-gray-200"
                  >
                    {email} <span className="text-gray-400">+CC</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBcc((v) => addEmailToList(v, email))}
                    title={`Add ${email} to BCC`}
                    className="px-2 py-1 text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                  >
                    +BCC
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Template picker */}
          <div>
            <label className={LABEL}>Email Template (optional)</label>
            {loadingTpls ? (
              <p className="text-sm text-gray-400">Loading templates...</p>
            ) : (
              <select
                ref={firstRef}
                value={selectedTemplateId}
                onChange={(e) => onTemplateChange(e.target.value)}
                className={INPUT}
              >
                <option value="">- Custom message -</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.type})
                  </option>
                ))}
              </select>
            )}
            {templates.length === 0 && !loadingTpls && (
              <p className="text-xs text-gray-400 mt-1">
                No saved templates yet. You can write a custom message below, or create templates in the Email module.
              </p>
            )}
          </div>

          {/* Available variables hint */}
          <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
            <p className="text-xs text-blue-700 font-medium mb-1">Available variables (auto-filled from this invoice):</p>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-blue-600 font-mono">
              {[
                ['{customer_name}', vars.customer_name],
                ['{shop_name}', vars.shop_name || '(empty)'],
                ['{invoice_amount}', vars.invoice_amount],
                ['{balance_due}', vars.balance_due],
                ['{service_name}', vars.service_name || '(empty)'],
                ['{invoice_number}', vars.invoice_number || '(empty)'],
                ['{business_name}', vars.business_name || '(empty)'],
              ].map(([token, val]) => (
                <span key={token}>{token} <span className="text-blue-400">{'->'} {val}</span></span>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className={LABEL}>Subject *</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Invoice #{invoice_number} from {business_name}"
              className={INPUT}
              maxLength={300}
            />
          </div>

          {/* Body - Edit / Preview tabs */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={LABEL + ' mb-0'}>Body (HTML)</label>
              <div className="flex rounded-lg overflow-hidden border border-gray-200 text-xs">
                <button
                  type="button"
                  onClick={() => setTab('edit')}
                  className={`px-3 py-1.5 font-medium transition-colors ${tab === 'edit' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setTab('preview')}
                  className={`px-3 py-1.5 font-medium transition-colors ${tab === 'preview' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  Preview
                </button>
              </div>
            </div>

            {tab === 'edit' ? (
              <textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={10}
                placeholder="<p>Dear {customer_name},</p><p>Please find your invoice attached...</p>"
                className={`${INPUT} resize-y font-mono text-xs`}
              />
            ) : (
              <div className="rounded-lg border border-gray-200 overflow-hidden" style={{ height: '260px' }}>
                {bodyHtml ? (
                  <iframe
                    title="Email preview"
                    srcDoc={renderVars(bodyHtml, vars)}
                    className="w-full h-full"
                    sandbox="allow-same-origin"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-400">
                    No body content yet - switch to Edit and type some HTML.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PDF note */}
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 002.112 2.13" />
            </svg>
            Invoice PDF will be generated and attached automatically.
          </p>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !recipientEmail}
            className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            {sending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              'Send Invoice'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
