export type Preset = 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear' | 'lastYear' | 'allTime' | 'custom' | 'monthYear';

export interface DateRange {
  from: string;   // ISO date YYYY-MM-DD, or 'all' for all-time
  to: string;     // ISO date YYYY-MM-DD (ignored when from='all')
  preset: Preset;
  label: string;
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pad(n: number) { return String(n).padStart(2, '0'); }
function toISO(d: Date)  { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }

export function getThisMonth(): DateRange {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  return {
    from: toISO(new Date(y, m, 1)),
    to:   toISO(new Date(y, m + 1, 0)),
    preset: 'thisMonth',
    label: `${MONTHS[m]} ${y}`,
  };
}

export function getLastMonth(): DateRange {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const y = d.getFullYear(), m = d.getMonth();
  return {
    from: toISO(d),
    to:   toISO(new Date(y, m + 1, 0)),
    preset: 'lastMonth',
    label: `${MONTHS[m]} ${y}`,
  };
}

export function getThisQuarter(): DateRange {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const sm = q * 3;
  const y = now.getFullYear();
  return {
    from: toISO(new Date(y, sm, 1)),
    to:   toISO(new Date(y, sm + 3, 0)),
    preset: 'thisQuarter',
    label: `Q${q + 1} ${y}`,
  };
}

export function getThisYear(): DateRange {
  const y = new Date().getFullYear();
  return { from: `${y}-01-01`, to: `${y}-12-31`, preset: 'thisYear', label: String(y) };
}

export function getLastYear(): DateRange {
  const y = new Date().getFullYear() - 1;
  return { from: `${y}-01-01`, to: `${y}-12-31`, preset: 'lastYear', label: String(y) };
}

export function getAllTime(): DateRange {
  return { from: 'all', to: '', preset: 'allTime', label: 'All Time' };
}

export function getMonthYear(year: number, month: number): DateRange {
  return {
    from: toISO(new Date(year, month, 1)),
    to:   toISO(new Date(year, month + 1, 0)),
    preset: 'monthYear',
    label: `${MONTHS[month]} ${year}`,
  };
}

export function formatRangeLabel(range: DateRange): string {
  if (range.preset === 'allTime') return 'All Time';
  if (range.preset === 'thisMonth' || range.preset === 'lastMonth' ||
      range.preset === 'monthYear'  || range.preset === 'thisYear' ||
      range.preset === 'lastYear'   || range.preset === 'thisQuarter') {
    return range.label;
  }
  // Custom
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  const f = new Date(range.from + 'T00:00:00');
  const t = new Date(range.to   + 'T00:00:00');
  return `${f.toLocaleDateString(undefined, opts)} – ${t.toLocaleDateString(undefined, opts)}`;
}

export const DEFAULT_RANGE: DateRange = getThisMonth();
