import type { RevenueBucket, BucketType } from './dashboardApi';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Bar { label: string; revenue: number; bucketIso: string }

/** Parse the ISO bucket string (from DATE_TRUNC) into year/month/day parts */
function parseBucket(iso: string): { year: number; month: number; day: number } {
  const d = new Date(iso);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function fillMonthly(data: RevenueBucket[], periodFrom?: string, periodTo?: string): Bar[] {
  if (!periodFrom || !periodTo) {
    return data.map((r) => {
      const { year, month } = parseBucket(r.bucket);
      return { label: `${MONTH_NAMES[month - 1]} '${String(year).slice(2)}`, revenue: r.revenue, bucketIso: r.bucket };
    });
  }
  const start = new Date(periodFrom + 'T00:00:00');
  const end   = new Date(periodTo   + 'T00:00:00');
  const bars: Bar[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const found = data.find((r) => {
      const p = parseBucket(r.bucket);
      return p.year === y && p.month === m;
    });
    bars.push({ label: `${MONTH_NAMES[m - 1]} '${String(y).slice(2)}`, revenue: found?.revenue ?? 0, bucketIso: cur.toISOString() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return bars;
}

function fillDaily(data: RevenueBucket[], periodFrom?: string, periodTo?: string): Bar[] {
  if (!periodFrom || !periodTo) {
    return data.map((r) => {
      const { month, day } = parseBucket(r.bucket);
      return { label: `${month}/${day}`, revenue: r.revenue, bucketIso: r.bucket };
    });
  }
  const start = new Date(periodFrom + 'T00:00:00');
  const end   = new Date(periodTo   + 'T00:00:00');
  const bars: Bar[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const day = cur.getDate();
    const found = data.find((r) => {
      const p = parseBucket(r.bucket);
      return p.year === y && p.month === m && p.day === day;
    });
    bars.push({ label: `${m}/${day}`, revenue: found?.revenue ?? 0, bucketIso: cur.toISOString() });
    cur.setDate(cur.getDate() + 1);
  }
  return bars;
}

function renderWeekly(data: RevenueBucket[]): Bar[] {
  return data.map((r, i) => ({
    label: `W${i + 1}`,
    revenue: r.revenue,
    bucketIso: r.bucket,
  }));
}

function buildBars(data: RevenueBucket[], bucketType: BucketType, periodFrom?: string, periodTo?: string): Bar[] {
  if (bucketType === 'daily')  return fillDaily(data, periodFrom, periodTo);
  if (bucketType === 'weekly') return renderWeekly(data);
  return fillMonthly(data, periodFrom, periodTo);
}

const MAX_BARS = 31;

interface Props {
  data: RevenueBucket[];
  title: string;
  bucketType?: BucketType;
  periodFrom?: string;
  periodTo?: string;
}

export default function RevenueBarChart({ data, title, bucketType = 'monthly', periodFrom, periodTo }: Props) {
  const allBars = buildBars(data, bucketType, periodFrom, periodTo);
  const bars = allBars.length > MAX_BARS ? allBars.slice(-MAX_BARS) : allBars;
  const max = Math.max(...bars.map((b) => b.revenue), 1);
  const lastIdx = bars.length - 1;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
        {allBars.length > MAX_BARS && (
          <span className="text-[10px] text-gray-400">Showing last {MAX_BARS} of {allBars.length}</span>
        )}
      </div>
      {bars.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No revenue data for this period.</p>
      ) : (
        <div className="flex items-end gap-1 h-36 overflow-x-auto">
          {bars.map((b, i) => {
            const pct = (b.revenue / max) * 100;
            const isLast = i === lastIdx;
            return (
              <div key={b.bucketIso} className="flex-1 min-w-[20px] flex flex-col items-center gap-1">
                <span className="text-[9px] text-gray-400 whitespace-nowrap leading-none">
                  {b.revenue > 0 ? `$${b.revenue >= 1000 ? `${(b.revenue / 1000).toFixed(1)}k` : b.revenue.toFixed(0)}` : ''}
                </span>
                <div className="w-full flex items-end" style={{ height: '96px' }}>
                  <div
                    className={`w-full rounded-t-md transition-all ${isLast ? 'bg-indigo-500' : 'bg-indigo-200'}`}
                    style={{ height: `${Math.max(pct, b.revenue > 0 ? 4 : 0)}%` }}
                    title={`$${b.revenue.toLocaleString()}`}
                  />
                </div>
                <span className="text-[9px] text-gray-400 leading-none">{b.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
