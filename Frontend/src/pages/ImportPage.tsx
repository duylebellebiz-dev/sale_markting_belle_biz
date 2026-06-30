/**
 * Import page — two tabs: Customers (§10.2) and Invoices (§10.3).
 * Routes:
 *   GET  /import/customers/template
 *   POST /import/customers/preview  / commit
 *   GET  /import/invoices/template
 *   POST /import/invoices/preview   / commit
 */
import { useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { usePermission } from '../features/staff/usePermission';
import api from '../lib/api';

// ─── Shared helpers ────────────────────────────────────────────────────────────

function extractMsg(err: unknown) {
  const m = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : (m ?? 'Something went wrong.');
}

const BACKEND = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000';

async function downloadBlob(url: string, filename: string) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BACKEND}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Server returned ${res.status}`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap text-xs">
      {children}
    </th>
  );
}

function StatPill({
  label, value, color = 'gray',
}: {
  label: string; value: number;
  color?: 'gray' | 'indigo' | 'green' | 'red' | 'amber' | 'blue' | 'violet';
}) {
  const bg: Record<string, string> = {
    gray:   'bg-gray-100 text-gray-700',
    indigo: 'bg-indigo-100 text-indigo-700',
    green:  'bg-green-100 text-green-700',
    red:    'bg-red-100 text-red-700',
    amber:  'bg-amber-100 text-amber-700',
    blue:   'bg-blue-100 text-blue-700',
    violet: 'bg-violet-100 text-violet-700',
  };
  return (
    <div className={`rounded-xl py-3 px-2 text-center ${bg[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-80">{label}</p>
    </div>
  );
}

type RowStatus = 'valid' | 'duplicate' | 'error' | 'warning';

function RowBadge({ status }: { status: RowStatus }) {
  const map: Record<RowStatus, string> = {
    valid:     'bg-green-100 text-green-700',
    duplicate: 'bg-amber-100 text-amber-700',
    error:     'bg-red-100 text-red-700',
    warning:   'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

// Customer import
interface CustomerRowResult {
  rowNumber: number;
  status: RowStatus;
  errors?: string[];
  data?: {
    customerName?: string; email?: string; phoneNumber?: string;
    shopName?: string; shopAddress?: string; shopPhoneNumber?: string;
    contactSource?: string; stage?: string; status?: string;
    note?: string; dateOfContact?: string;
  };
  existingId?: string;
}
interface CustomerPreview {
  total: number; valid: number; duplicates: number; errors: number;
  rows: CustomerRowResult[];
}
interface CustomerCommitResult {
  total: number; imported: number; updated: number; skipped: number; failed: number;
  errors: { rowNumber: number; reason: string }[];
}

// Invoice import
interface InvoiceRowResult {
  rowNumber: number;
  status: RowStatus;
  errors?: string[];
  warnings?: string[];
  data?: { invoiceNumber?: string; clientName?: string; amount?: string; status?: string };
  existingId?: string;
  resolvedCustomerName?: string;
}
interface InvoicePreview {
  total: number; valid: number; duplicates: number; errors: number; warnings: number;
  rows: InvoiceRowResult[];
}
interface InvoiceCommitResult {
  total: number; imported: number; updated: number; skipped: number; failed: number;
  customersCreated: number;
  errors: { rowNumber: number; reason: string }[];
}

type DupAction = 'skip' | 'update';
type UnknownClientAction = 'create' | 'skip';

// ─── Customer import tab ──────────────────────────────────────────────────────

function CustomerImportTab({ canImport }: { canImport: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]             = useState<File | null>(null);
  const [preview, setPreview]       = useState<CustomerPreview | null>(null);
  const [result, setResult]         = useState<CustomerCommitResult | null>(null);
  const [dupAction, setDupAction]   = useState<DupAction>('update');
  const [previewing, setPreviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr]               = useState<string | null>(null);

  function reset() { setPreview(null); setResult(null); setErr(null); }

  async function handleDownload() {
    setDownloading(true); setErr(null);
    try { await downloadBlob('/import/customers/template', 'customers-import-template.xlsx'); }
    catch (e) { setErr(extractMsg(e)); }
    finally { setDownloading(false); }
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true); setErr(null); setPreview(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<CustomerPreview>('/import/customers/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);
    } catch (e) { setErr(extractMsg(e)); }
    finally { setPreviewing(false); }
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setCommitting(true); setErr(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('duplicateAction', dupAction);
      const res = await api.post<CustomerCommitResult>('/import/customers/commit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setPreview(null); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) { setErr(extractMsg(e)); }
    finally { setCommitting(false); }
  }

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex justify-end">
        <button onClick={handleDownload} disabled={downloading}
          className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50 disabled:opacity-50 transition-colors">
          {downloading ? 'Downloading…' : 'Download Template'}
        </button>
      </div>

      {err && <ErrBanner msg={err} onClose={() => setErr(null)} />}

      {result && <CustomerResult result={result} />}

      {/* Step 1 */}
      <FileCard
        fileRef={fileRef} file={file}
        onChange={(f) => { setFile(f); reset(); }}
        onValidate={handlePreview}
        disabled={!canImport} loading={previewing}
      />

      {/* Step 2 */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
            Step 2 — Review &amp; Confirm
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <StatPill label="Total Rows"      value={preview.total}      />
            <StatPill label="Ready to Import" value={preview.valid}      color="indigo" />
            <StatPill label="Duplicates"      value={preview.duplicates} color="amber" />
            <StatPill label="Errors"          value={preview.errors}     color="red" />
          </div>

          {preview.duplicates > 0 && (
            <DupActionBox
              label="duplicates detected (matched by email or phone)"
              count={preview.duplicates}
              value={dupAction}
              onChange={setDupAction}
            />
          )}

          <PreviewTable rows={preview.rows.map((r) => ({
            rowNumber: r.rowNumber,
            status:    r.status,
            cols: [
              r.data?.customerName ?? '—',
              r.data?.shopName ?? '—',
              r.data?.email ?? '—',
              r.data?.phoneNumber ?? '—',
              r.data?.shopPhoneNumber ?? '—',
              r.data?.shopAddress ?? '—',
              r.data?.contactSource ?? '—',
              r.data?.stage ?? '—',
              r.data?.status ?? '—',
              r.data?.dateOfContact ?? '—',
              r.data?.note ?? '—',
            ],
            detail:    r.errors?.join('; ') ?? (r.status === 'duplicate' ? 'Matches existing record' : ''),
          }))} headers={['Customer Name', 'Shop Name', 'Email', 'Phone', 'Shop Phone', 'Shop Address', 'Source', 'Stage', 'Status', 'Date of Contact', 'Note']} />

          {preview.valid + preview.duplicates > 0
            ? <CommitButton loading={committing} onClick={handleCommit}
                label={`Confirm Import — ${preview.valid} new${preview.duplicates > 0 ? ` + ${preview.duplicates} duplicate${preview.duplicates !== 1 ? 's' : ''} (${dupAction})` : ''}`} />
            : <p className="text-center text-sm text-gray-400">No valid rows. Fix errors and re-upload.</p>
          }
        </div>
      )}
    </div>
  );
}

function CustomerResult({ result }: { result: CustomerCommitResult }) {
  return (
    <div className="rounded-xl bg-green-50 border border-green-200 p-5 space-y-3">
      <p className="font-semibold text-green-800">Customer import complete!</p>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
        <StatPill label="Total"    value={result.total}    />
        <StatPill label="Imported" value={result.imported} color="indigo" />
        <StatPill label="Updated"  value={result.updated}  color="blue" />
        <StatPill label="Skipped"  value={result.skipped}  color="gray" />
        <StatPill label="Failed"   value={result.failed}   color="red" />
      </div>
      <FailureDetails errors={result.errors} />
    </div>
  );
}

// ─── Invoice import tab ────────────────────────────────────────────────────────

function InvoiceImportTab({ canImport }: { canImport: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]               = useState<File | null>(null);
  const [preview, setPreview]         = useState<InvoicePreview | null>(null);
  const [result, setResult]           = useState<InvoiceCommitResult | null>(null);
  const [dupAction, setDupAction]     = useState<DupAction>('skip');
  const [clientAction, setClientAction] = useState<UnknownClientAction>('skip');
  const [previewing, setPreviewing]   = useState(false);
  const [committing, setCommitting]   = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  function reset() { setPreview(null); setResult(null); setErr(null); }

  async function handleDownload() {
    setDownloading(true); setErr(null);
    try { await downloadBlob('/import/invoices/template', 'invoices-import-template.xlsx'); }
    catch (e) { setErr(extractMsg(e)); }
    finally { setDownloading(false); }
  }

  async function handlePreview() {
    if (!file) return;
    setPreviewing(true); setErr(null); setPreview(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<InvoicePreview>('/import/invoices/preview', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setPreview(res.data);
    } catch (e) { setErr(extractMsg(e)); }
    finally { setPreviewing(false); }
  }

  async function handleCommit() {
    if (!file || !preview) return;
    setCommitting(true); setErr(null); setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('duplicateAction', dupAction);
      form.append('unknownClientAction', clientAction);
      const res = await api.post<InvoiceCommitResult>('/import/invoices/commit', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setPreview(null); setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) { setErr(extractMsg(e)); }
    finally { setCommitting(false); }
  }

  // How many rows will be actionable (valid/warning + duplicates if update)
  const actionableCount = (preview?.valid ?? 0) + (preview?.duplicates ?? 0);

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex justify-end">
        <button onClick={handleDownload} disabled={downloading}
          className="px-4 py-2 rounded-lg border border-violet-300 text-violet-700 text-sm font-medium hover:bg-violet-50 disabled:opacity-50 transition-colors">
          {downloading ? 'Downloading…' : 'Download Template'}
        </button>
      </div>

      {err && <ErrBanner msg={err} onClose={() => setErr(null)} />}

      {result && <InvoiceResult result={result} />}

      {/* Step 1 */}
      <FileCard
        fileRef={fileRef} file={file}
        onChange={(f) => { setFile(f); reset(); }}
        onValidate={handlePreview}
        disabled={!canImport} loading={previewing}
        accent="violet"
      />

      {/* Step 2 */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
            Step 2 — Review &amp; Confirm
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <StatPill label="Total Rows"      value={preview.total}      />
            <StatPill label="Valid"           value={preview.valid}      color="indigo" />
            <StatPill label="Duplicates"      value={preview.duplicates} color="amber" />
            <StatPill label="Warnings"        value={preview.warnings}   color="blue" />
            <StatPill label="Errors"          value={preview.errors}     color="red" />
          </div>

          {/* Warnings info box */}
          {preview.warnings > 0 && (
            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
              <span className="font-semibold">{preview.warnings} row{preview.warnings !== 1 ? 's' : ''} have warnings</span>
              {' '}(e.g. unparseable dates, missing payAmount for Paid). They will still be imported — check the Details column.
            </div>
          )}

          {/* Duplicate action */}
          {preview.duplicates > 0 && (
            <DupActionBox
              label="invoices with the same invoice number already exist"
              count={preview.duplicates}
              value={dupAction}
              onChange={setDupAction}
            />
          )}

          {/* Unknown client action */}
          {preview.rows.some((r) => !r.resolvedCustomerName && r.status !== 'error') && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
              <p className="text-sm font-medium text-amber-800">
                Some rows reference a client name not found in your customer list.
                What should happen to those rows?
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="clientAction" value="create"
                    checked={clientAction === 'create'}
                    onChange={() => setClientAction('create')}
                    className="accent-violet-600" />
                  <span>Create a minimal customer record automatically</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="clientAction" value="skip"
                    checked={clientAction === 'skip'}
                    onChange={() => setClientAction('skip')}
                    className="accent-violet-600" />
                  <span>Skip the row (don't import)</span>
                </label>
              </div>
            </div>
          )}

          {/* Per-row table */}
          <PreviewTable rows={preview.rows.map((r) => ({
            rowNumber: r.rowNumber,
            status:    r.status,
            cols: [
              r.data?.invoiceNumber ?? '—',
              r.data?.clientName ?? '—',
              r.data?.amount ?? '—',
              r.data?.status ?? '—',
            ],
            detail:
              r.errors?.join('; ') ??
              r.warnings?.join('; ') ??
              (r.status === 'duplicate'
                ? `Matches existing invoice #${r.data?.invoiceNumber}`
                : r.resolvedCustomerName
                ? `→ ${r.resolvedCustomerName}`
                : r.data?.clientName
                ? `⚠ Customer "${r.data.clientName}" not found`
                : ''),
          }))} headers={['Invoice #', 'Client Name', 'Amount', 'Status']} />

          {actionableCount > 0
            ? <CommitButton loading={committing} onClick={handleCommit} accent="violet"
                label={buildCommitLabel(preview, dupAction, clientAction)} />
            : <p className="text-center text-sm text-gray-400">No importable rows. Fix errors and re-upload.</p>
          }
        </div>
      )}
    </div>
  );
}

function buildCommitLabel(p: InvoicePreview, dup: DupAction, client: UnknownClientAction) {
  const parts: string[] = [`${p.valid} new`];
  if (p.duplicates > 0) parts.push(`${p.duplicates} duplicate${p.duplicates !== 1 ? 's' : ''} (${dup})`);
  const unknownRows = p.rows.filter((r) => !r.resolvedCustomerName && r.status !== 'error').length;
  if (unknownRows > 0) parts.push(`${unknownRows} unknown client${unknownRows !== 1 ? 's' : ''} (${client})`);
  return `Confirm Import — ${parts.join(', ')}`;
}

function InvoiceResult({ result }: { result: InvoiceCommitResult }) {
  return (
    <div className="rounded-xl bg-green-50 border border-green-200 p-5 space-y-3">
      <p className="font-semibold text-green-800">Invoice import complete!</p>
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 text-center">
        <StatPill label="Total"            value={result.total}            />
        <StatPill label="Imported"         value={result.imported}         color="indigo" />
        <StatPill label="Updated"          value={result.updated}          color="blue" />
        <StatPill label="Skipped"          value={result.skipped}          color="gray" />
        <StatPill label="Failed"           value={result.failed}           color="red" />
        <StatPill label="Customers Made"   value={result.customersCreated} color="violet" />
      </div>
      <FailureDetails errors={result.errors} />
    </div>
  );
}

// ─── Shared leaf components ───────────────────────────────────────────────────

function ErrBanner({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between items-start">
      <span>{msg}</span>
      <button onClick={onClose} className="ml-4 text-red-400 hover:text-red-600 shrink-0">✕</button>
    </div>
  );
}

function FileCard({
  fileRef, file, onChange, onValidate, disabled, loading,
  accent = 'indigo',
}: {
  fileRef: React.RefObject<HTMLInputElement | null>;
  file: File | null;
  onChange: (f: File | null) => void;
  onValidate: () => void;
  disabled: boolean;
  loading: boolean;
  accent?: 'indigo' | 'violet';
}) {
  const ring  = accent === 'violet' ? 'hover:border-violet-400 hover:bg-violet-50/30' : 'hover:border-indigo-400 hover:bg-indigo-50/30';
  const btn   = accent === 'violet'
    ? 'bg-violet-600 hover:bg-violet-700'
    : 'bg-indigo-600 hover:bg-indigo-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="font-semibold text-gray-800 text-sm uppercase tracking-wide">
        Step 1 — Choose File
      </h3>
      <p className="text-xs text-gray-500">
        Accepted: <strong>.xlsx</strong> and <strong>.csv</strong>.
        Column headers must match the template (download above).
      </p>
      <label className={`flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-xl p-10 cursor-pointer transition-colors ${ring}`}>
        <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
        </svg>
        {file
          ? <span className={`text-sm font-medium ${accent === 'violet' ? 'text-violet-700' : 'text-indigo-700'}`}>{file.name}</span>
          : <span className="text-sm text-gray-400">Click to browse or drag a file here</span>}
        <input ref={fileRef} type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          className="hidden" />
      </label>
      <button onClick={onValidate} disabled={!file || disabled || loading}
        className={`w-full py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${btn}`}>
        {loading ? 'Validating…' : 'Validate File'}
      </button>
    </div>
  );
}

function DupActionBox({
  count, label, value, onChange,
}: {
  count: number; label: string;
  value: DupAction; onChange: (v: DupAction) => void;
}) {
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-2">
      <p className="text-sm font-medium text-amber-800">
        {count} {label}. What should happen?
      </p>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="dupAction" value="skip"
            checked={value === 'skip'} onChange={() => onChange('skip')} className="accent-indigo-600" />
          Skip (keep existing)
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="dupAction" value="update"
            checked={value === 'update'} onChange={() => onChange('update')} className="accent-indigo-600" />
          Update (overwrite with file data)
        </label>
      </div>
    </div>
  );
}

interface PreviewRow {
  rowNumber: number; status: RowStatus;
  cols: string[]; detail: string;
}

function PreviewTable({ rows, headers }: { rows: PreviewRow[]; headers: string[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 max-h-96 overflow-y-auto">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-gray-50 z-10">
          <tr className="border-b border-gray-200">
            <Th>Row</Th>
            <Th>Status</Th>
            {headers.map((h) => <Th key={h}>{h}</Th>)}
            <Th>Details</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.rowNumber} className={
              r.status === 'error'     ? 'bg-red-50' :
              r.status === 'duplicate' ? 'bg-amber-50' :
              r.status === 'warning'   ? 'bg-blue-50' : ''
            }>
              <td className="px-3 py-2 font-mono text-gray-400">{r.rowNumber}</td>
              <td className="px-3 py-2"><RowBadge status={r.status} /></td>
              {r.cols.map((c, i) => (
                <td key={i} className="px-3 py-2 text-gray-600 max-w-[140px] truncate" title={c}>{c}</td>
              ))}
              <td className="px-3 py-2 text-gray-500 max-w-xs">
                {r.status === 'error'  && <span className="text-red-600">{r.detail}</span>}
                {r.status === 'warning' && <span className="text-blue-600">{r.detail}</span>}
                {r.status !== 'error' && r.status !== 'warning' && <span>{r.detail}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CommitButton({
  label, loading, onClick, accent = 'indigo',
}: {
  label: string; loading: boolean; onClick: () => void; accent?: 'indigo' | 'violet';
}) {
  const cls = accent === 'violet'
    ? 'bg-violet-600 hover:bg-violet-700'
    : 'bg-green-600 hover:bg-green-700';
  return (
    <button onClick={onClick} disabled={loading}
      className={`w-full py-3 rounded-lg text-white text-sm font-semibold disabled:opacity-50 transition-colors ${cls}`}>
      {loading ? 'Importing…' : label}
    </button>
  );
}

function FailureDetails({ errors }: { errors: { rowNumber: number; reason: string }[] }) {
  if (!errors.length) return null;
  return (
    <details className="mt-1">
      <summary className="text-sm text-red-600 cursor-pointer font-medium">
        {errors.length} row{errors.length !== 1 ? 's' : ''} failed — click to view
      </summary>
      <ul className="mt-2 space-y-1 text-xs text-red-700">
        {errors.map((e) => (
          <li key={e.rowNumber} className="flex gap-2">
            <span className="shrink-0 font-mono text-gray-400">Row {e.rowNumber}</span>
            <span>{e.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Tab = 'customers' | 'invoices';

export default function ImportPage() {
  const canImport = usePermission('importData');
  const [tab, setTab] = useState<Tab>('customers');

  return (
    <AppShell title="Import Data">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Data</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Upload a .xlsx or .csv file to bring existing records into the app.
          </p>
        </div>

        {!canImport && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
            You don't have the <strong>importData</strong> permission. Ask your owner to enable it.
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          {(['customers', 'invoices'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                tab === t
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'customers' ? 'Customers' : 'Invoices'}
            </button>
          ))}
        </div>

        {tab === 'customers' && <CustomerImportTab canImport={canImport} />}
        {tab === 'invoices'  && <InvoiceImportTab  canImport={canImport} />}
      </div>
    </AppShell>
  );
}
