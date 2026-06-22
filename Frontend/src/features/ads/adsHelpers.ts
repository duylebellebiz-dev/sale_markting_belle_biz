import type { AdProvider, Campaign } from './adsApi';

export function fmt(n: string | number | null | undefined, decimals = 2) {
  if (n == null || n === '') return '—';
  const num = typeof n === 'string' ? parseFloat(n) : n;
  return isNaN(num) ? '—' : num.toLocaleString('en-CA', { maximumFractionDigits: decimals });
}

export function fmtPct(n: number | null | undefined) {
  if (n == null) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export function fmtMoney(n: string | null | undefined) {
  if (!n) return '—';
  const num = parseFloat(n);
  return isNaN(num) ? '—' : `$${num.toFixed(2)}`;
}

export const PROVIDER_LABELS: Record<AdProvider, string> = { facebook: 'Facebook', google: 'Google' };

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  ENABLED: 'bg-green-100 text-green-800',
  PAUSED: 'bg-amber-100 text-amber-800',
  DELETED: 'bg-red-100 text-red-800',
  REMOVED: 'bg-red-100 text-red-800',
};

export function statusCls(s: string) {
  return STATUS_COLOR[s?.toUpperCase()] ?? 'bg-gray-100 text-gray-700';
}

// Facebook uses "ACTIVE", Google Ads uses "ENABLED" — both mean the campaign is currently running.
const ACTIVE_STATUSES = new Set(['ACTIVE', 'ENABLED']);

export function isActiveStatus(s: string): boolean {
  return ACTIVE_STATUSES.has(s?.toUpperCase());
}

// Aggregate all metrics for a campaign (for the summary row)
export function aggregateMetrics(metrics: Campaign['metrics']) {
  if (!metrics.length) return null;
  let impressions = 0n, clicks = 0n, spend = 0, conversions = 0, reach: bigint | null = null;
  for (const m of metrics) {
    impressions += BigInt(m.impressions);
    clicks += BigInt(m.clicks);
    spend += m.spend ? parseFloat(m.spend) : 0;
    conversions += m.conversions ?? 0;
    if (m.reach) reach = (reach ?? 0n) + BigInt(m.reach);
  }
  const ctr = impressions > 0n ? Number(clicks) / Number(impressions) : null;
  const cpc = clicks > 0n && spend > 0 ? spend / Number(clicks) : null;
  const roas = metrics.some((m) => m.roas != null)
    ? metrics.reduce((s, m) => s + (m.roas ?? 0), 0) / metrics.filter((m) => m.roas != null).length
    : null;
  return { impressions, clicks, spend, conversions, reach, ctr, cpc, roas };
}
