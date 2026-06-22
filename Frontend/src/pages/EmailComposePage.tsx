import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AppShell from '../components/AppShell';
import RichTextEditor from '../features/email/RichTextEditor';
import { useEmailTemplates } from '../features/email/useEmailTemplates';
import { useAuth } from '../context/AuthContext';
import { customersApi, PIPELINE_STAGES, type Customer, type StaffUser } from '../features/customers/customersApi';
import {
  emailCampaignApi,
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_SIZE_MB,
  MAX_ATTACHMENTS,
  DAILY_CAP,
  type SegmentFilter,
  type DailyCap,
} from '../features/email/emailCampaignApi';
import { extractApiError } from '../features/email/useEmailTemplates';
import { servicesApi, type Service } from '../features/services/servicesApi';

const CARD = 'bg-white rounded-xl border border-gray-200 shadow-sm';
const CARD_HEADER = 'px-5 py-4 border-b border-gray-100 flex items-center gap-2';
const CARD_BODY = 'px-5 py-4 space-y-4';
const INPUT =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';
const SELECT = INPUT;
const LABEL = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1';

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className={CARD_HEADER}>
      <h3 className="text-sm font-semibold text-gray-800">{children}</h3>
    </div>
  );
}

function Spinner({ sm }: { sm?: boolean }) {
  return (
    <div className={`border-indigo-200 border-t-indigo-600 rounded-full animate-spin ${sm ? 'w-4 h-4 border-2' : 'w-7 h-7 border-4'}`} />
  );
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      <span className="flex-1">{msg}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-red-400 hover:text-red-600 ml-2 shrink-0">x</button>
      )}
    </div>
  );
}

/* --- 1. Content section --- */

interface ContentProps {
  templateId: string;
  setTemplateId: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  bodyHtml: string;
  setBodyHtml: (v: string) => void;
}

function ContentSection({
  templateId, setTemplateId,
  subject, setSubject,
  bodyHtml, setBodyHtml,
}: ContentProps) {
  const { templates, loading: tmplLoading } = useEmailTemplates();

  function handleTemplateChange(id: string) {
    setTemplateId(id);
    if (!id) return;
    const tmpl = templates.find((t) => t.id === id);
    if (tmpl) {
      setSubject(tmpl.subject);
      setBodyHtml(tmpl.bodyHtml);
    }
  }

  return (
    <div className={CARD}>
      <CardTitle>Email Content</CardTitle>
      <div className={CARD_BODY}>

        <div>
          <label className={LABEL}>Template (optional)</label>
          {tmplLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Spinner sm /> Loading templates...
            </div>
          ) : (
            <select
              value={templateId}
              onChange={(e) => handleTemplateChange(e.target.value)}
              className={SELECT}
            >
              <option value="">-- No template (custom) --</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          {templateId && (
            <p className="mt-1 text-xs text-indigo-600">
              Template loaded - you can still edit subject and body below.
            </p>
          )}
        </div>

        <div>
          <label className={LABEL}>Subject *</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={INPUT}
            placeholder="Hi {customer_name}, here's an update..."
            maxLength={200}
          />
        </div>

        <div>
          <label className={LABEL}>Body *</label>
          <RichTextEditor
            value={bodyHtml}
            onChange={setBodyHtml}
            placeholder="Write your message... use the variable picker to personalise."
          />
          <p className="mt-1.5 text-xs text-gray-400">
            Variables like <code className="bg-gray-100 px-1 rounded">{'{customer_name}'}</code> are replaced per recipient at send time.
          </p>
        </div>
      </div>
    </div>
  );
}

/* --- 2. Attachment section --- */

interface AttachmentProps {
  files: File[];
  setFiles: React.Dispatch<React.SetStateAction<File[]>>;
}

function AttachmentSection({ files, setFiles }: AttachmentProps) {
  const [attachError, setAttachError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | null) {
    if (!incoming) return;
    setAttachError(null);
    const candidates = Array.from(incoming);
    const errors: string[] = [];

    const validated = candidates.filter((f) => {
      if (!ALLOWED_ATTACHMENT_TYPES.includes(f.type as typeof ALLOWED_ATTACHMENT_TYPES[number])) {
        errors.push(`"${f.name}": unsupported type (PDF, DOCX, PNG, JPG only)`);
        return false;
      }
      if (f.size > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) {
        errors.push(`"${f.name}": exceeds ${MAX_ATTACHMENT_SIZE_MB} MB limit`);
        return false;
      }
      return true;
    });

    setFiles((prev) => {
      const combined = [...prev, ...validated];
      if (combined.length > MAX_ATTACHMENTS) {
        errors.push(`Maximum ${MAX_ATTACHMENTS} attachments allowed`);
        return prev.slice(0, MAX_ATTACHMENTS);
      }
      return combined.slice(0, MAX_ATTACHMENTS);
    });

    if (errors.length) setAttachError(errors.join(' | '));
    if (inputRef.current) inputRef.current.value = '';
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function fmtSize(bytes: number) {
    return bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(0)} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileIcon(type: string) {
    if (type === 'application/pdf') return 'PDF';
    if (type.includes('image')) return 'IMG';
    if (type.includes('word') || type.includes('document')) return 'DOC';
    return 'FILE';
  }

  return (
    <div className={CARD}>
      <CardTitle>
        Attachments{' '}
        <span className="text-xs font-normal text-gray-400">
          (optional - up to {MAX_ATTACHMENTS} files, {MAX_ATTACHMENT_SIZE_MB} MB each)
        </span>
      </CardTitle>
      <div className={CARD_BODY}>
        {attachError && (
          <ErrorBanner msg={attachError} onDismiss={() => setAttachError(null)} />
        )}

        {files.length > 0 && (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 overflow-hidden">
            {files.map((f, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 bg-white">
                <span className="text-xs font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{fileIcon(f.type)}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{f.name}</p>
                  <p className="text-xs text-gray-400">{fmtSize(f.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="text-gray-400 hover:text-red-500 transition-colors text-sm leading-none shrink-0"
                  title="Remove"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {files.length < MAX_ATTACHMENTS && (
          <div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.png,.jpg,.jpeg"
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-2 text-sm text-indigo-600 border border-dashed border-indigo-300 rounded-lg px-4 py-2.5 hover:bg-indigo-50 transition-colors w-full justify-center"
            >
              + Attach file
            </button>
            <p className="mt-1 text-xs text-gray-400 text-center">
              PDF, DOCX, PNG, JPG - max {MAX_ATTACHMENT_SIZE_MB} MB each
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/* --- 3. Recipient / segment section --- */

type SegmentType = 'all' | 'stagePipeline' | 'subscription' | 'unpaidInvoice';

interface SegmentProps {
  isOwner: boolean;
  segment: SegmentFilter;
  setSegment: React.Dispatch<React.SetStateAction<SegmentFilter>>;
  customers: Customer[];
  staff: StaffUser[];
  services: Service[];
  customersLoading: boolean;
  dailyCap: DailyCap | null;
  capLoading: boolean;
}

function hasEmail(c: Customer) {
  return typeof c.email === 'string' && c.email.trim().length > 0;
}

function detectSegmentType(seg: SegmentFilter): SegmentType {
  if (seg.hasActiveSubscription || seg.subscriptionServiceId || seg.subscriptionExpiringDays != null) return 'subscription';
  if (seg.unpaidInvoiceOnly || seg.unpaidOverdueDays != null) return 'unpaidInvoice';
  if (seg.stage || seg.status) return 'stagePipeline';
  return 'all';
}

function needsServerCount(seg: SegmentFilter) {
  return (
    seg.hasActiveSubscription ||
    seg.subscriptionServiceId != null ||
    seg.subscriptionExpiringDays != null ||
    seg.unpaidInvoiceOnly ||
    seg.unpaidOverdueDays != null
  );
}

function SegmentSection({
  isOwner, segment, setSegment,
  customers, staff, services,
  customersLoading, dailyCap, capLoading,
}: SegmentProps) {

  const [serverCount, setServerCount] = useState<number | null>(null);
  const [serverCountLoading, setServerCountLoading] = useState(false);

  function set(patch: Partial<SegmentFilter>) {
    setSegment((s) => ({ ...s, ...patch }));
  }

  const segmentType = detectSegmentType(segment);

  function changeType(next: SegmentType) {
    setSegment((s) => {
      const base: SegmentFilter = {
        salespersonId: s.salespersonId,
      };
      if (next === 'stagePipeline') return { ...base, stage: s.stage, status: s.status };
      if (next === 'subscription')  return { ...base, hasActiveSubscription: true };
      if (next === 'unpaidInvoice') return { ...base, unpaidInvoiceOnly: true };
      return base;
    });
  }

  useEffect(() => {
    if (!needsServerCount(segment)) {
      setServerCount(null);
      return;
    }
    let cancelled = false;
    setServerCountLoading(true);
    const timer = setTimeout(async () => {
      try {
        const n = await emailCampaignApi.getSegmentCount(segment);
        if (!cancelled) setServerCount(n);
      } catch {
        if (!cancelled) setServerCount(null);
      } finally {
        if (!cancelled) setServerCountLoading(false);
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [segment]);

  const clientCount = useMemo(() => {
    if (needsServerCount(segment)) return null;
    return customers.filter((c) => {
      if (!hasEmail(c)) return false;
      if (isOwner && segment.salespersonId) {
        const aid = typeof c.assignedTo === 'object' ? c.assignedTo.id : c.assignedTo;
        if (aid !== segment.salespersonId) return false;
      }
      if (segment.stage && c.stage !== segment.stage) return false;
      if (segment.status?.trim()) {
        if (!c.status?.toLowerCase().includes(segment.status.trim().toLowerCase())) return false;
      }
      return true;
    }).length;
  }, [customers, segment, isOwner]);

  const count = needsServerCount(segment) ? (serverCount ?? 0) : (clientCount ?? 0);
  const countLoading = customersLoading || serverCountLoading;
  const remaining = dailyCap?.remaining ?? DAILY_CAP;
  const willSendNow = Math.min(count, remaining);
  const willDefer   = count - willSendNow;
  const overQuota   = count > remaining;

  return (
    <div className={CARD}>
      <CardTitle>Recipients</CardTitle>
      <div className={CARD_BODY}>

        {isOwner && (
          <div>
            <label className={LABEL}>Salesperson</label>
            <select
              value={segment.salespersonId ?? ''}
              onChange={(e) => set({ salespersonId: e.target.value || undefined })}
              className={SELECT}
            >
              <option value="">All salespeople</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className={LABEL}>Segment type</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              { id: 'all',          label: 'All contacts' },
              { id: 'stagePipeline',label: 'Stage / Status' },
              { id: 'subscription', label: 'Subscription clients' },
              { id: 'unpaidInvoice',label: 'Unpaid invoices' },
            ] as { id: SegmentType; label: string }[]).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => changeType(opt.id)}
                className={[
                  'rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors',
                  segmentType === opt.id
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {segmentType === 'stagePipeline' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div>
              <label className={LABEL}>Pipeline Stage</label>
              <select
                value={segment.stage ?? ''}
                onChange={(e) => set({ stage: e.target.value || undefined })}
                className={SELECT}
              >
                <option value="">Any stage</option>
                {PIPELINE_STAGES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Status contains</label>
              <input
                value={segment.status ?? ''}
                onChange={(e) => set({ status: e.target.value || undefined })}
                className={INPUT}
                placeholder="e.g. Interested"
              />
            </div>
          </div>
        )}

        {segmentType === 'subscription' && (
          <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">
              Targets customers with an <strong>Active</strong> subscription. Optionally narrow by service or expiry window.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL}>Service (optional)</label>
                <select
                  value={segment.subscriptionServiceId ?? ''}
                  onChange={(e) => set({ subscriptionServiceId: e.target.value || undefined })}
                  className={SELECT}
                >
                  <option value="">Any service</option>
                  {services.filter((s) => s.isActive).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={LABEL}>Expiring within N days</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={segment.subscriptionExpiringDays ?? ''}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      set({ subscriptionExpiringDays: isNaN(v) || v <= 0 ? undefined : v });
                    }}
                    className={`${INPUT} w-24`}
                    placeholder="e.g. 30"
                  />
                  <span className="text-sm text-gray-500">days</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {segmentType === 'unpaidInvoice' && (
          <div className="space-y-3 rounded-lg border border-gray-100 bg-gray-50 p-3">
            <p className="text-xs text-gray-500">
              Targets customers with at least one invoice in <strong>Sent</strong> or <strong>Overdue</strong> status with a balance remaining.
            </p>
            <div>
              <label className={LABEL}>Only if overdue &gt; N days (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={segment.unpaidOverdueDays ?? ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    set({ unpaidOverdueDays: isNaN(v) || v <= 0 ? undefined : v });
                  }}
                  className={`${INPUT} w-24`}
                  placeholder="e.g. 7"
                />
                <span className="text-sm text-gray-500">days past due date (leave blank for all unpaid)</span>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 space-y-3">

          {countLoading ? (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Spinner sm /> Counting recipients...
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Matching recipients
                </p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {count}
                </p>
                <p className="text-xs text-gray-400">customers with an email address</p>
              </div>

              {!capLoading && dailyCap && (
                <div className="text-right">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    Daily quota
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-gray-900">
                    {dailyCap.remaining}
                    <span className="text-sm font-normal text-gray-400">/{dailyCap.cap}</span>
                  </p>
                  <p className="text-xs text-gray-400">emails remaining today</p>
                </div>
              )}
            </div>
          )}

          {!capLoading && dailyCap && (
            <div>
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-all"
                  style={{ width: `${Math.min(100, (dailyCap.used / dailyCap.cap) * 100)}%` }}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {dailyCap.used} used - {dailyCap.remaining} remaining - resets at midnight
              </p>
            </div>
          )}

          {!countLoading && count === 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
              No customers with email addresses match this segment. Try broadening the filters.
            </div>
          )}

          {!countLoading && count > 0 && overQuota && (
            <div className="rounded-lg bg-orange-50 border border-orange-200 px-3 py-2 text-xs text-orange-700 space-y-0.5">
              <p className="font-semibold">Daily cap will be reached</p>
              <p>
                {willSendNow > 0
                  ? <><strong>{willSendNow}</strong> email{willSendNow !== 1 ? 's' : ''} will be sent today and <strong>{willDefer}</strong> deferred to tomorrow.</>
                  : <>Daily limit reached. All <strong>{count}</strong> emails will be deferred to tomorrow.</>
                }
              </p>
            </div>
          )}

          {!countLoading && remaining === 0 && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <strong>Daily limit reached</strong> - you have sent {dailyCap?.used ?? 100} emails today.
              Sending now will queue all emails for tomorrow.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --- 4. Delivery / schedule section --- */

interface DeliveryProps {
  mode: 'now' | 'schedule';
  setMode: (m: 'now' | 'schedule') => void;
  scheduledAt: string;
  setScheduledAt: (v: string) => void;
  cc: string;
  setCc: (v: string) => void;
  bcc: string;
  setBcc: (v: string) => void;
}

function DeliverySection({ mode, setMode, scheduledAt, setScheduledAt, cc, setCc, bcc, setBcc }: DeliveryProps) {
  function handleModeChange(m: 'now' | 'schedule') {
    setMode(m);
    if (m === 'schedule' && !scheduledAt) {
      const d = new Date(Date.now() + 60 * 60 * 1000);
      setScheduledAt(d.toISOString().slice(0, 16));
    }
  }

  const minDateTime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className={CARD}>
      <CardTitle>Delivery</CardTitle>
      <div className={CARD_BODY}>
        <div className="flex gap-3">
          {(['now', 'schedule'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleModeChange(m)}
              className={[
                'flex-1 rounded-lg border px-4 py-3 text-sm font-medium transition-colors text-left',
                mode === m
                  ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
              ].join(' ')}
            >
              {m === 'now' ? 'Send now' : 'Schedule for later'}
            </button>
          ))}
        </div>

        {mode === 'schedule' && (
          <div>
            <label className={LABEL}>Send at *</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minDateTime}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={`${INPUT} max-w-xs`}
            />
            {scheduledAt && (
              <p className="mt-1 text-xs text-gray-400">
                Will be dispatched by the hourly cron worker on or after this time.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={LABEL}>CC (optional)</label>
            <input
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              className={INPUT}
              placeholder="you@example.com, manager@example.com"
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
        <p className="text-xs text-gray-400 -mt-1">
          Comma-separated email addresses. Applied to every recipient in this send.
        </p>
      </div>
    </div>
  );
}

/* --- Result banner --- */

interface ResultBannerProps {
  message: string;
  onReset: () => void;
}

function ResultBanner({ message, onReset }: ResultBannerProps) {
  return (
    <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-4 flex items-start gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold text-green-800">Email campaign submitted</p>
        <p className="text-sm text-green-700 mt-0.5">{message}</p>
      </div>
      <button
        type="button"
        onClick={onReset}
        className="shrink-0 text-xs text-green-600 border border-green-300 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors"
      >
        Compose another
      </button>
    </div>
  );
}

/* --- Page --- */

export default function EmailComposePage() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';

  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject]       = useState('');
  const [bodyHtml, setBodyHtml]     = useState('');

  const [files, setFiles] = useState<File[]>([]);

  const [segment, setSegment] = useState<SegmentFilter>({});

  const [mode, setMode]           = useState<'now' | 'schedule'>('now');
  const [scheduledAt, setScheduledAt] = useState('');
  const [cc, setCc]   = useState('');
  const [bcc, setBcc] = useState('');

  const [customers, setCustomers]         = useState<Customer[]>([]);
  const [staff, setStaff]                 = useState<StaffUser[]>([]);
  const [services, setServices]           = useState<Service[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [dailyCap, setDailyCap]           = useState<DailyCap | null>(null);
  const [capLoading, setCapLoading]       = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{ message: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [custs, staffList, svcList] = await Promise.all([
          customersApi.list(),
          isOwner ? customersApi.listStaff() : Promise.resolve([] as StaffUser[]),
          servicesApi.list(),
        ]);
        if (!cancelled) {
          setCustomers(custs);
          setStaff(staffList);
          setServices(svcList);
          setCustomersLoading(false);
        }
      } catch {
        if (!cancelled) setCustomersLoading(false);
      }
    }

    async function loadCap() {
      try {
        const cap = await emailCampaignApi.getDailyCap();
        if (!cancelled) setDailyCap(cap);
      } catch {
        // Non-fatal - quota bar just won't show
      } finally {
        if (!cancelled) setCapLoading(false);
      }
    }

    loadData();
    loadCap();
    return () => { cancelled = true; };
  }, [isOwner]);

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function invalidEmails(raw: string): string[] {
    return raw.split(',').map((e) => e.trim()).filter((e) => e && !EMAIL_RE.test(e));
  }

  function validate(): string | null {
    if (!subject.trim())  return 'Subject is required.';
    if (!bodyHtml.trim() || bodyHtml === '<p></p>') return 'Email body cannot be empty.';
    if (mode === 'schedule') {
      if (!scheduledAt) return 'Please choose a send time.';
      if (new Date(scheduledAt) <= new Date()) return 'Scheduled time must be in the future.';
    }
    const badCc = invalidEmails(cc);
    if (badCc.length) return `Invalid CC address(es): ${badCc.join(', ')}`;
    const badBcc = invalidEmails(bcc);
    if (badBcc.length) return `Invalid BCC address(es): ${badBcc.join(', ')}`;
    return null;
  }

  const handleSend = useCallback(async () => {
    setSubmitError(null);
    const err = validate();
    if (err) { setSubmitError(err); return; }

    const formData = new FormData();
    if (templateId) formData.append('templateId', templateId);
    formData.append('subject', subject.trim());
    formData.append('bodyHtml', bodyHtml);

    const seg: SegmentFilter = {};
    if (isOwner && segment.salespersonId)          seg.salespersonId = segment.salespersonId;
    if (segment.stage)                             seg.stage = segment.stage;
    if (segment.status?.trim())                    seg.status = segment.status.trim();
    if (segment.hasActiveSubscription)             seg.hasActiveSubscription = true;
    if (segment.subscriptionServiceId)             seg.subscriptionServiceId = segment.subscriptionServiceId;
    if (segment.subscriptionExpiringDays != null)  seg.subscriptionExpiringDays = segment.subscriptionExpiringDays;
    if (segment.unpaidInvoiceOnly)                 seg.unpaidInvoiceOnly = true;
    if (segment.unpaidOverdueDays != null)         seg.unpaidOverdueDays = segment.unpaidOverdueDays;
    formData.append('segment', JSON.stringify(seg));

    if (mode === 'schedule' && scheduledAt) {
      formData.append('scheduledAt', new Date(scheduledAt).toISOString());
    }

    if (cc.trim())  formData.append('cc', cc.trim());
    if (bcc.trim()) formData.append('bcc', bcc.trim());

    for (const f of files) {
      formData.append('attachments', f);
    }

    setSubmitting(true);
    try {
      const res = await emailCampaignApi.send(formData);
      setResult({ message: res.message });
      emailCampaignApi.getDailyCap().then(setDailyCap).catch(() => {});
    } catch (err) {
      setSubmitError(extractApiError(err));
    } finally {
      setSubmitting(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, subject, bodyHtml, segment, mode, scheduledAt, cc, bcc, files, isOwner]);

  function resetForm() {
    setTemplateId('');
    setSubject('');
    setBodyHtml('');
    setFiles([]);
    setSegment({});
    setMode('now');
    setScheduledAt('');
    setCc('');
    setBcc('');
    setResult(null);
    setSubmitError(null);
    emailCampaignApi.getDailyCap().then(setDailyCap).catch(() => {});
  }

  const hasContent = subject.trim().length > 0 && bodyHtml.trim().length > 0 && bodyHtml !== '<p></p>';

  return (
    <AppShell title="Compose Email">
      <div className="max-w-3xl mx-auto space-y-5 pb-12">

        <div>
          <h2 className="text-2xl font-bold text-gray-900">Compose Email</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {isOwner
              ? 'Send to a filtered segment of your business contacts.'
              : 'Send to your assigned customers.'}
          </p>
        </div>

        {result && (
          <ResultBanner message={result.message} onReset={resetForm} />
        )}

        {!result && (
          <>
            <ContentSection
              templateId={templateId}  setTemplateId={setTemplateId}
              subject={subject}        setSubject={setSubject}
              bodyHtml={bodyHtml}      setBodyHtml={setBodyHtml}
            />

            <AttachmentSection files={files} setFiles={setFiles} />

            <SegmentSection
              isOwner={isOwner}
              segment={segment}
              setSegment={setSegment}
              customers={customers}
              staff={staff}
              services={services}
              customersLoading={customersLoading}
              dailyCap={dailyCap}
              capLoading={capLoading}
            />

            <DeliverySection
              mode={mode}           setMode={setMode}
              scheduledAt={scheduledAt} setScheduledAt={setScheduledAt}
              cc={cc} setCc={setCc}
              bcc={bcc} setBcc={setBcc}
            />

            {submitError && (
              <ErrorBanner msg={submitError} onDismiss={() => setSubmitError(null)} />
            )}

            <div className="flex items-center justify-between gap-4 pt-1">
              <p className="text-xs text-gray-400">
                {mode === 'now'
                  ? 'Email will be sent immediately after you click Send.'
                  : `Email will be queued for ${scheduledAt ? new Date(scheduledAt).toLocaleString() : '...'}.`}
              </p>
              <button
                type="button"
                onClick={handleSend}
                disabled={submitting || !hasContent}
                className={[
                  'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors',
                  submitting || !hasContent
                    ? 'bg-indigo-300 cursor-not-allowed'
                    : mode === 'now'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-teal-600 hover:bg-teal-700',
                ].join(' ')}
              >
                {submitting && <Spinner sm />}
                {submitting
                  ? 'Sending...'
                  : mode === 'now'
                  ? 'Send Now'
                  : 'Schedule'}
              </button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
