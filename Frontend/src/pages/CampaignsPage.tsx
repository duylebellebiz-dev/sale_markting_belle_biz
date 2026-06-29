import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { adsApi, type AdAccount, type AdProvider, type Campaign, type ImportPreviewRow, type ImportSummary, type SyncResult } from '../features/ads/adsApi';
import { aggregateMetrics, fmt, fmtPct, isActiveStatus, PROVIDER_LABELS, statusCls } from '../features/ads/adsHelpers';
import { usePermission } from '../features/staff/usePermission';

// ── Import Panel ──────────────────────────────────────────────────────────────

function ImportPanel({ accounts, canAnalyze }: { accounts: AdAccount[]; canAnalyze: boolean }) {
  const [provider, setProvider] = useState<AdProvider>('facebook');
  const [adAccountId, setAdAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ rows: ImportPreviewRow[]; warnings: string[] } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const filteredAccounts = accounts.filter((a) => a.provider === provider);

  async function handlePreview() {
    if (!file || !canAnalyze) return;
    setLoading(true); setError(null); setSummary(null);
    try { setPreview(await adsApi.previewImport(provider, file)); }
    catch (e: unknown) { setError((e as {response?: {data?: {message?: string}}})?.response?.data?.message ?? 'Preview failed.'); }
    finally { setLoading(false); }
  }

  async function handleCommit() {
    if (!file || !adAccountId || !canAnalyze) return;
    setLoading(true); setError(null);
    try { setSummary(await adsApi.commitImport(provider, file, adAccountId)); setPreview(null); }
    catch (e: unknown) { setError((e as {response?: {data?: {message?: string}}})?.response?.data?.message ?? 'Import failed.'); }
    finally { setLoading(false); }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-6 space-y-4">
      <h2 className="text-base font-semibold text-gray-800">CSV / Excel Import (Fallback)</h2>
      <p className="text-sm text-gray-500">
        Use this to import an export from Ads Manager / Google Ads before your developer app is approved.
      </p>

      <div className="flex flex-wrap gap-3">
        {/* Provider */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Platform</label>
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value as AdProvider); setPreview(null); setSummary(null); }}
            className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="facebook">Facebook Ads</option>
            <option value="google">Google Ads</option>
          </select>
        </div>

        {/* Ad account target */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Ad Account</label>
          <select
            value={adAccountId}
            onChange={(e) => setAdAccountId(e.target.value)}
            className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">— select —</option>
            {filteredAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.accountName || a.id}</option>
            ))}
          </select>
          {!filteredAccounts.length && (
            <p className="text-xs text-amber-600 mt-1">
              No {provider} account connected — go to Ad Accounts to connect one first.
            </p>
          )}
        </div>

        {/* Template download */}
        <div className="flex items-end">
          <button
            onClick={() => adsApi.downloadTemplate(provider)}
            className="px-3 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-xs font-medium hover:bg-indigo-50 transition-colors"
          >
            Download Template
          </button>
        </div>
      </div>

      {/* File input */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">File (CSV or XLSX)</label>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); setSummary(null); }}
          className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-300 file:text-xs file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={handlePreview}
          disabled={!file || loading || !canAnalyze}
          className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {loading && !preview ? 'Validating…' : 'Preview'}
        </button>
        <button
          onClick={handleCommit}
          disabled={!file || !adAccountId || loading || !canAnalyze}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          {loading && preview ? 'Importing…' : 'Import'}
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Preview table */}
      {preview && (
        <div className="mt-2">
          {preview.warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-600 mb-1">{w}</p>
          ))}
          <p className="text-xs text-gray-500 mb-2">
            {preview.rows.filter((r) => r.valid).length} valid / {preview.rows.filter((r) => !r.valid).length} invalid of {preview.rows.length} rows
          </p>
          <div className="overflow-x-auto max-h-60 border border-gray-200 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['#', 'Campaign', 'Date', 'Impressions', 'Clicks', 'Spend', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} className={row.valid ? '' : 'bg-red-50'}>
                    <td className="px-3 py-1.5 text-gray-400">{row.rowNumber}</td>
                    <td className="px-3 py-1.5 font-medium text-gray-800 max-w-[180px] truncate">{row.campaignName || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">{row.date ?? '—'}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.impressions}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.clicks}</td>
                    <td className="px-3 py-1.5 text-gray-600">{row.spend ? `$${parseFloat(row.spend).toFixed(2)}` : '—'}</td>
                    <td className="px-3 py-1.5">
                      {row.errors.length ? (
                        <span className="text-red-600">{row.errors[0]}</span>
                      ) : (
                        <span className="text-green-600">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import summary */}
      {summary && (
        <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold mb-1">Import complete</p>
          <p>Imported: {summary.imported} &nbsp;·&nbsp; Skipped: {summary.skipped} &nbsp;·&nbsp; Failed: {summary.failed} &nbsp;of {summary.total} rows</p>
          {summary.errors.slice(0, 5).map((e, i) => (
            <p key={i} className="text-xs text-red-600 mt-1">Row {e.row}: {e.reason}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Period selector ──────────────────────────────────────────────────────────

type PeriodPreset = '30d' | '90d' | 'thisMonth' | 'all' | 'custom';

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Resolves a preset (or custom range) to concrete dateFrom/dateTo strings, or undefined for the default 30-day view. */
function resolvePeriod(preset: PeriodPreset, customFrom: string, customTo: string): { dateFrom?: string; dateTo?: string } {
  const today = new Date();
  if (preset === '30d') return {}; // backend default already = last 30 synced days
  if (preset === '90d') {
    const from = new Date(today); from.setDate(from.getDate() - 89);
    return { dateFrom: toISODate(from), dateTo: toISODate(today) };
  }
  if (preset === 'thisMonth') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    return { dateFrom: toISODate(from), dateTo: toISODate(today) };
  }
  if (preset === 'all') {
    return { dateFrom: '2000-01-01', dateTo: toISODate(today) };
  }
  // custom
  return customFrom && customTo ? { dateFrom: customFrom, dateTo: customTo } : {};
}

// ── Aggregated row shape used by both the per-account summary and the table ───

interface AggRow {
  campaign: Campaign;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number;
  conversions: number;
  cpc: number | null;
  roas: number | null;
}

function toAggRow(campaign: Campaign): AggRow {
  const agg = aggregateMetrics(campaign.metrics);
  return {
    campaign,
    impressions: agg ? Number(agg.impressions) : 0,
    clicks: agg ? Number(agg.clicks) : 0,
    ctr: agg?.ctr ?? null,
    spend: agg?.spend ?? 0,
    conversions: agg?.conversions ?? 0,
    cpc: agg?.cpc ?? null,
    roas: agg?.roas ?? null,
  };
}

type SortKey = 'name' | 'impressions' | 'clicks' | 'ctr' | 'spend' | 'conversions' | 'cpc' | 'roas';

function sumRows(rows: AggRow[]) {
  let impressions = 0, clicks = 0, spend = 0, conversions = 0;
  for (const r of rows) { impressions += r.impressions; clicks += r.clicks; spend += r.spend; conversions += r.conversions; }
  const ctr = impressions > 0 ? clicks / impressions : null;
  const cpc = clicks > 0 ? spend / clicks : null;
  return { impressions, clicks, spend, conversions, ctr, cpc };
}

// ── Account group (collapsible table) ────────────────────────────────────────

function AccountGroup({
  accountLabel,
  provider,
  rows,
  selectedIds,
  onToggleOne,
}: {
  accountLabel: string;
  provider: AdProvider;
  rows: AggRow[];
  selectedIds: Set<string>;
  onToggleOne: (campaignId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filtered = rows.filter((r) => r.campaign.name.toLowerCase().includes(search.toLowerCase()));
  const sorted = [...filtered].sort((a, b) => {
    const av = sortKey === 'name' ? a.campaign.name : a[sortKey] ?? -Infinity;
    const bv = sortKey === 'name' ? b.campaign.name : b[sortKey] ?? -Infinity;
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    return sortDir === 'asc' ? cmp : -cmp;
  });
  const totals = sumRows(rows);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const columns: { key: SortKey; label: string }[] = [
    { key: 'name', label: 'Campaign' },
    { key: 'impressions', label: 'Impr.' },
    { key: 'clicks', label: 'Clicks' },
    { key: 'ctr', label: 'CTR' },
    { key: 'spend', label: 'Spend' },
    { key: 'conversions', label: 'Conv.' },
    { key: 'cpc', label: 'CPC' },
    { key: 'roas', label: 'ROAS' },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm mb-4 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600 shrink-0">
            {PROVIDER_LABELS[provider]}
          </span>
          <span className="font-semibold text-gray-900 text-sm truncate">{accountLabel}</span>
          <span className="text-xs text-gray-400 shrink-0">({rows.length} campaign{rows.length === 1 ? '' : 's'})</span>
        </div>
        <div className="flex items-center gap-4 shrink-0 text-xs text-gray-600">
          <span><strong className="text-gray-900">${totals.spend.toFixed(2)}</strong> spend</span>
          <span><strong className="text-gray-900">{fmt(totals.clicks, 0)}</strong> clicks</span>
          <span><strong className="text-gray-900">{fmtPct(totals.ctr)}</strong> CTR</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>
      </button>

      {!collapsed && (
        <div>
          <div className="px-4 pt-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search campaign name…"
              className="w-full max-w-xs rounded-lg border border-gray-300 text-xs px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2" />
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-4 py-2 text-left font-medium whitespace-nowrap cursor-pointer hover:text-gray-800 select-none"
                    >
                      {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-left font-medium whitespace-nowrap">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((r) => (
                  <tr key={r.campaign.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.campaign.id)}
                        onChange={() => onToggleOne(r.campaign.id)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 max-w-[260px]">
                      <Link to={`/campaigns/${r.campaign.id}`} className="font-medium text-gray-800 hover:text-indigo-600 hover:underline truncate block">
                        {r.campaign.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(r.impressions, 0)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(r.clicks, 0)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtPct(r.ctr)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">${r.spend.toFixed(2)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmt(r.conversions, 0)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.cpc != null ? `$${r.cpc.toFixed(2)}` : '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{r.roas != null ? `${r.roas.toFixed(2)}×` : '—'}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusCls(r.campaign.status)}`}>
                        {r.campaign.status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <Link to={`/campaigns/${r.campaign.id}`} className="text-indigo-600 hover:underline">View</Link>
                    </td>
                  </tr>
                ))}
                {!sorted.length && (
                  <tr><td colSpan={11} className="px-4 py-6 text-center text-gray-400">No campaigns match.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CampaignsPage() {
  const canAnalyze = usePermission('analyzeAds');
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [accounts, setAccounts] = useState<AdAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [filterAccount, setFilterAccount] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [syncStatusFilter, setSyncStatusFilter] = useState<'active_paused' | 'all'>('active_paused');
  const [syncLimit, setSyncLimit] = useState<number | undefined>(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const period = resolvePeriod(periodPreset, customFrom, customTo);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Mirrors the sync-time campaign limit so the page shows the same set that was
      // just synced (most recently updated first), not every campaign ever stored.
      const [c, a] = await Promise.all([
        adsApi.listCampaigns({ adAccountId: filterAccount || undefined, limit: syncLimit, ...period }),
        adsApi.listAccounts(),
      ]);
      setCampaigns(c);
      setAccounts(a);
    } catch {
      setError('Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [filterAccount, period.dateFrom, period.dateTo, syncLimit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function handleSync(accountId: string) {
    if (!canAnalyze) return;
    setSyncing(accountId); setError(null); setSyncResult(null);
    try {
      // Reuses the page's own period filter so "sync this month" pulls only that
      // month's campaigns/insights instead of always crawling every campaign.
      const result = await adsApi.sync(accountId, { statusFilter: syncStatusFilter, limit: syncLimit, ...period });
      setSyncResult(result);
      await load();
    } catch (e: unknown) {
      setError((e as {response?: {data?: {message?: string}}})?.response?.data?.message ?? 'Sync failed.');
    } finally {
      setSyncing(null);
    }
  }

  async function handleExport() {
    setExporting(true); setError(null);
    try {
      await adsApi.downloadCampaignsXlsx({ adAccountId: filterAccount || undefined, ...period });
    } catch {
      setError('Failed to export the report.');
    } finally {
      setExporting(false);
    }
  }

  function toggleSelected(campaignId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(campaignId)) next.delete(campaignId);
      else next.add(campaignId);
      return next;
    });
  }

  function handleAnalyzeSelected() {
    if (selectedIds.size < 2) return;
    navigate(`/campaigns/analyze-batch?ids=${Array.from(selectedIds).join(',')}`);
  }

  const statusFiltered = useMemo(() => {
    if (statusFilter === 'all') return campaigns;
    return campaigns.filter((c) =>
      statusFilter === 'active' ? isActiveStatus(c.status) : !isActiveStatus(c.status),
    );
  }, [campaigns, statusFilter]);

  // Group campaigns by ad account so a fanpage with 100+ campaigns doesn't drown out the rest.
  const groups = useMemo(() => {
    const byAccount = new Map<string, AggRow[]>();
    for (const c of statusFiltered) {
      const key = c.adAccountId;
      if (!byAccount.has(key)) byAccount.set(key, []);
      byAccount.get(key)!.push(toAggRow(c));
    }
    return Array.from(byAccount.entries()).map(([adAccountId, rows]) => ({
      adAccountId,
      label: rows[0].campaign.adAccount.accountName || adAccountId,
      provider: rows[0].campaign.provider,
      rows,
    })).sort((a, b) => sumRows(b.rows).spend - sumRows(a.rows).spend);
  }, [statusFiltered]);

  const grandTotals = useMemo(() => sumRows(statusFiltered.map(toAggRow)), [statusFiltered]);
  const activeCount = useMemo(() => campaigns.filter((c) => isActiveStatus(c.status)).length, [campaigns]);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto py-10 px-4">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ad Campaigns</h1>
            <p className="text-sm text-gray-500 mt-0.5">Synced from Facebook and Google Ads</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedIds.size > 0 && (
              <button
                onClick={handleAnalyzeSelected}
                disabled={selectedIds.size < 2 || !canAnalyze}
                title={selectedIds.size < 2 ? 'Select at least 2 campaigns' : undefined}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                Analyze {selectedIds.size} selected together
              </button>
            )}
            <Link
              to="/campaigns/analyze-batch"
              className="px-4 py-2 rounded-lg border border-emerald-300 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors"
            >
              Batch analysis history
            </Link>
            <button
              onClick={handleExport}
              disabled={exporting || !campaigns.length}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {exporting ? 'Exporting…' : 'Export Excel'}
            </button>
            <button
              onClick={() => setShowImport((v) => !v)}
              className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 text-sm font-medium hover:bg-indigo-50 transition-colors"
            >
              {showImport ? 'Hide Import' : 'CSV Import'}
            </button>
            {accounts.some((a) => a.status === 'active') && (
              <select
                value={syncStatusFilter}
                onChange={(e) => setSyncStatusFilter(e.target.value as 'active_paused' | 'all')}
                title="Which campaigns to pull from the provider when syncing"
                className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="active_paused">Sync: Active + Paused only</option>
                <option value="all">Sync: All campaigns (slower)</option>
              </select>
            )}
            {accounts.some((a) => a.status === 'active') && (
              <select
                value={syncLimit ?? 'all'}
                onChange={(e) => setSyncLimit(e.target.value === 'all' ? undefined : Number(e.target.value))}
                title="How many of the most recently created campaigns to sync this run"
                className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value={10}>Newest 10 campaigns</option>
                <option value={25}>Newest 25 campaigns</option>
                <option value={50}>Newest 50 campaigns</option>
                <option value={100}>Newest 100 campaigns</option>
                <option value="all">All matching campaigns</option>
              </select>
            )}
            {accounts.filter((a) => a.status === 'active').map((a) => (
              <button
                key={a.id}
                onClick={() => handleSync(a.id)}
                disabled={!!syncing || !canAnalyze}
                title={period.dateFrom ? `Syncs the "${periodPreset}" period currently selected below` : undefined}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {syncing === a.id ? 'Syncing…' : `Sync ${a.accountName || PROVIDER_LABELS[a.provider]}`}
              </button>
            ))}
          </div>
        </div>

        {/* Permission gate */}
        {!canAnalyze && (
          <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4 text-sm text-amber-700">
            You don't have the <strong>analyzeAds</strong> permission. Ask your owner to enable it
            to sync data or run AI analysis. You can still view existing campaigns.
          </div>
        )}

        {/* No accounts connected at all */}
        {!loading && !accounts.length && (
          <div className="mb-4 rounded-xl bg-indigo-50 border border-indigo-200 px-5 py-4 text-sm text-indigo-800">
            No ad accounts connected yet.{' '}
            <Link to="/ad-accounts" className="font-semibold underline hover:text-indigo-900">
              Connect Facebook or Google Ads
            </Link>{' '}
            to start syncing campaigns, or use CSV Import below as a fallback.
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {syncResult && syncResult.rateLimited && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            {syncResult.message ?? 'Facebook rate limit reached — sync stopped early.'}
          </div>
        )}
        {syncResult && !syncResult.rateLimited && (
          <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Sync complete — {syncResult.campaignsUpserted} campaigns, {syncResult.metricsUpserted} metric rows ({syncResult.dateFrom} → {syncResult.dateTo})
          </div>
        )}

        {showImport && (
          <div className="mb-6">
            <ImportPanel accounts={accounts} canAnalyze={canAnalyze} />
          </div>
        )}

        {/* Filters: account + period */}
        <div className="mb-5 flex flex-wrap items-end gap-3">
          {accounts.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Ad account</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{PROVIDER_LABELS[a.provider]} — {a.accountName || a.id}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All statuses ({campaigns.length})</option>
              <option value="active">Active only ({activeCount})</option>
              <option value="inactive">Paused / other ({campaigns.length - activeCount})</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Period</label>
            <select
              value={periodPreset}
              onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
              className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="thisMonth">This month</option>
              <option value="all">All time</option>
              <option value="custom">Custom range…</option>
            </select>
          </div>

          {periodPreset === 'custom' && (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-gray-300 text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </>
          )}
        </div>

        {/* Grand totals across the current filter */}
        {!loading && campaigns.length > 0 && (
          <div className="mb-5 grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Campaigns', value: String(campaigns.length) },
              { label: 'Impressions', value: fmt(grandTotals.impressions, 0) },
              { label: 'Clicks', value: fmt(grandTotals.clicks, 0) },
              { label: 'CTR', value: fmtPct(grandTotals.ctr) },
              { label: 'Spend', value: `$${grandTotals.spend.toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                <p className="text-base font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && !campaigns.length && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No campaigns yet.</p>
            <p className="text-xs mt-1">
              {accounts.some((a) => a.status === 'active')
                ? 'Click "Sync" to pull your campaigns from the connected ad account.'
                : 'Connect an ad account on the Ad Accounts page, then sync or use CSV Import.'}
            </p>
          </div>
        )}

        {!loading && campaigns.length > 0 && !statusFiltered.length && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-sm">No campaigns match this status filter.</p>
          </div>
        )}

        {/* Campaigns grouped by ad account */}
        {!loading && groups.map((g) => (
          <AccountGroup
            key={g.adAccountId}
            accountLabel={g.label}
            provider={g.provider}
            rows={g.rows}
            selectedIds={selectedIds}
            onToggleOne={toggleSelected}
          />
        ))}
      </div>
    </AppShell>
  );
}
