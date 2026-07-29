/**
 * Modal for emailing several invoices in one action — each invoice is sent
 * separately to its own customer with its own PDF attached (§12.3b, extended
 * for bulk use). Subject/body variables are personalized per invoice on the
 * backend, same as the single-invoice send.
 */
import { useEffect, useRef, useState } from 'react';
import type { Invoice } from './invoicesApi';
import { invoicesApi } from './invoicesApi';
import { emailTemplatesApi } from '../email/emailTemplatesApi';
import type { EmailTemplate } from '../email/emailTemplatesApi';
import { businessesApi } from '../businesses/businessesApi';

function recipientEmail(inv: Invoice): string {
  return (
    inv.billTo?.email ||
    (typeof inv.customerId === 'object' ? (inv.customerId as any).email : '') ||
    ''
  );
}

function customerLabel(inv: Invoice): string {
  if (inv.billTo?.name) return inv.billTo.name;
  if (typeof inv.customerId === 'object') return inv.customerId.customerName;
  return '-';
}

const INPUT = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white';
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

interface Props {
  invoices: Invoice[];
  onClose: () => void;
  onSent: () => void;
}

type Result = { invoiceId: string; invoiceNumber?: string; success: boolean; error?: string };

export default function BulkSendInvoiceEmailModal({ invoices, onClose, onSent }: Props) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTpls, setLoadingTpls] = useState(true);
  const [businessName, setBusinessName] = useState('');

  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);

  const firstRef = useRef<HTMLSelectElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  useEffect(() => {
    emailTemplatesApi.list().then(setTemplates).catch(() => setTemplates([])).finally(() => setLoadingTpls(false));
  }, []);

  useEffect(() => {
    businessesApi.getMe().then((res) => setBusinessName(res.businessName)).catch(() => {});
  }, []);

  const withEmail = invoices.filter((inv) => recipientEmail(inv));
  const withoutEmail = invoices.filter((inv) => !recipientEmail(inv));

  function onTemplateChange(id: string) {
    setSelectedTemplateId(id);
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setSubject(tpl.subject);
    setBodyHtml(tpl.bodyHtml);
  }

  async function handleSend() {
    if (!withEmail.length) {
      setError('None of the selected invoices have a customer email on file.');
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await invoicesApi.sendBulkEmail({
        invoiceIds: withEmail.map((inv) => inv.id),
        templateId: selectedTemplateId || undefined,
        customSubject: subject.trim() || undefined,
        customBodyHtml: bodyHtml.trim() || undefined,
      });
      setResults(res.results);
      onSent();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
      setError(Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Failed to send emails.'));
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
            <h2 className="text-lg font-semibold text-gray-900">Send {invoices.length} Invoices by Email</h2>
            <p className="text-xs text-gray-500 mt-0.5">Each invoice is emailed separately, with its own PDF attached.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start justify-between gap-3">
              <span>{error}</span>
              <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-600 mt-0.5">&times;</button>
            </div>
          )}

          {results ? (
            <div className="space-y-3">
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
                Sent {results.filter((r) => r.success).length} of {results.length} invoice(s) successfully.
              </div>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                {results.map((r) => (
                  <div key={r.invoiceId} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-medium text-gray-800">#{r.invoiceNumber ?? r.invoiceId}</span>
                    {r.success ? (
                      <span className="text-green-600 text-xs font-medium">Sent</span>
                    ) : (
                      <span className="text-red-600 text-xs" title={r.error}>Failed{r.error ? `: ${r.error}` : ''}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Recipients preview */}
              <div>
                <p className={LABEL}>Recipients ({withEmail.length})</p>
                <div className="rounded-lg border border-gray-200 max-h-32 overflow-y-auto divide-y divide-gray-100">
                  {invoices.map((inv) => {
                    const email = recipientEmail(inv);
                    return (
                      <div key={inv.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-gray-700">#{inv.invoiceNumber} - {customerLabel(inv)}</span>
                        <span className={email ? 'text-gray-500' : 'text-red-500'}>{email || 'no email'}</span>
                      </div>
                    );
                  })}
                </div>
                {withoutEmail.length > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    {withoutEmail.length} invoice(s) will be skipped - no email address on file.
                  </p>
                )}
              </div>

              {/* Template picker */}
              <div>
                <label className={LABEL}>Email Template (optional)</label>
                {loadingTpls ? (
                  <p className="text-sm text-gray-400">Loading templates...</p>
                ) : (
                  <select ref={firstRef} value={selectedTemplateId} onChange={(e) => onTemplateChange(e.target.value)} className={INPUT}>
                    <option value="">- Custom message -</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>{t.name} ({t.type})</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-xs text-blue-700">
                  Variables like <span className="font-mono">{'{customer_name}'}</span>, <span className="font-mono">{'{invoice_amount}'}</span>,{' '}
                  <span className="font-mono">{'{invoice_number}'}</span> are personalized per invoice when sent.
                  {businessName && <> Business: <span className="font-medium">{businessName}</span>.</>}
                </p>
              </div>

              {/* Subject */}
              <div>
                <label className={LABEL}>Subject</label>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Invoice #{invoice_number} from {business_name}"
                  className={INPUT}
                  maxLength={300}
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank to use the default invoice email for each invoice.</p>
              </div>

              {/* Body */}
              <div>
                <label className={LABEL}>Body (HTML)</label>
                <textarea
                  value={bodyHtml}
                  onChange={(e) => setBodyHtml(e.target.value)}
                  rows={8}
                  placeholder="<p>Dear {customer_name},</p><p>Please find your invoice attached...</p>"
                  className={`${INPUT} resize-y font-mono text-xs`}
                />
              </div>

              <p className="text-xs text-gray-400">Each invoice's PDF is generated and attached automatically.</p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
            {results ? 'Close' : 'Cancel'}
          </button>
          {!results && (
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !withEmail.length}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {sending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                `Send ${withEmail.length} Invoice${withEmail.length !== 1 ? 's' : ''}`
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
