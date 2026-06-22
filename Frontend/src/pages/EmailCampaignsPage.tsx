import { useEffect, useState, useCallback } from 'react';
import AppShell from '../components/AppShell';
import { emailCampaignApi, type Campaign, type CampaignStats } from '../features/email/emailCampaignApi';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtDate(iso?: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

const STATUS_COLORS: Record<string, string> = {
  sent:           'bg-green-100 text-green-700',
  partially_sent: 'bg-yellow-100 text-yellow-700',
  scheduled:      'bg-blue-100 text-blue-700',
  sending:        'bg-indigo-100 text-indigo-700',
  draft:          'bg-gray-100 text-gray-500',
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLORS[status] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Stats row (shown when a campaign is expanded)
// ---------------------------------------------------------------------------
function StatsPanel({ campaignId }: { campaignId: string }) {
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    emailCampaignApi
      .getCampaignStats(campaignId)
      .then((s) => { if (!cancelled) { setStats(s); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e?.response?.data?.message ?? 'Failed to load stats'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [campaignId]);

  if (loading) return <p className="text-xs text-gray-400 py-2 px-4">Loading stats...</p>;
  if (error)   return <p className="text-xs text-red-500 py-2 px-4">{error}</p>;
  if (!stats)  return null;

  const delivered = stats.total > 0 ? stats.delivered : 0;

  return (
    <div className="px-4 pb-4 pt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Sent" value={stats.sent} total={stats.total} />
      <StatCard label="Delivered" value={delivered} total={stats.total} />
      <StatCard label="Opened" value={stats.opened} rate={fmtPct(stats.openRate)} />
      <StatCard label="Clicked" value={stats.clicked} rate={fmtPct(stats.clickRate)} />
      <StatCard label="Bounced" value={stats.bounced} rate={fmtPct(stats.bounceRate)} danger />
      <StatCard label="Complained" value={stats.complained} danger />
      <StatCard label="Failed" value={stats.failed} danger={stats.failed > 0} />
      <StatCard label="Total recipients" value={stats.total} />
    </div>
  );
}

function StatCard({
  label,
  value,
  total,
  rate,
  danger = false,
}: {
  label: string;
  value: number;
  total?: number;
  rate?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-semibold ${danger && value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
        {total !== undefined && (
          <span className="text-xs font-normal text-gray-400 ml-1">/ {total}</span>
        )}
      </p>
      {rate && <p className="text-xs text-gray-500 mt-0.5">{rate}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Campaign row (expandable)
// ---------------------------------------------------------------------------
function CampaignRow({ c }: { c: Campaign }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{c.subject || '(no subject)'}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Sent {fmtDate(c.createdAt)}
            {c.scheduledAt && ` - Scheduled for ${fmtDate(c.scheduledAt)}`}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge status={c.status} />
          <span className="text-xs text-gray-500">{c.sentCount} sent</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded stats */}
      {expanded && <StatsPanel campaignId={c.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function EmailCampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    emailCampaignApi
      .listCampaigns()
      .then((data) => { setCampaigns(data); setLoading(false); })
      .catch((e) => { setError(e?.response?.data?.message ?? 'Failed to load campaigns'); setLoading(false); });
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = campaigns.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || (c.subject ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Email Campaigns</h1>
            <p className="mt-1 text-sm text-gray-500">
              View sent campaigns and their open / click / bounce rates.
            </p>
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by subject..."
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All statuses</option>
            <option value="sent">Sent</option>
            <option value="partially_sent">Partially sent</option>
            <option value="scheduled">Scheduled</option>
            <option value="sending">Sending</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        {/* States */}
        {loading && (
          <div className="py-20 text-center text-gray-400 text-sm">Loading campaigns...</div>
        )}

        {!loading && error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && campaigns.length === 0 && (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-14 text-center text-gray-400">
            <p className="text-sm">No campaigns yet. Go to <strong>Send Email</strong> to create one.</p>
          </div>
        )}

        {!loading && !error && campaigns.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No campaigns match your filter.</p>
        )}

        {/* Campaign list */}
        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((c) => (
              <CampaignRow key={c.id} c={c} />
            ))}
          </div>
        )}

        {/* Summary */}
        {!loading && campaigns.length > 0 && (
          <p className="mt-4 text-xs text-gray-400 text-right">
            {filtered.length} of {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </AppShell>
  );
}
