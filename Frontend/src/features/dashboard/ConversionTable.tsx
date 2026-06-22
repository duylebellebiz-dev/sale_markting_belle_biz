import type { SalespersonStat } from './dashboardApi';

interface Props { stats: SalespersonStat[] }

export default function ConversionTable({ stats }: Props) {
  if (stats.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Conversion Rate by Salesperson
        </p>
        <p className="text-sm text-gray-400 text-center py-6">No data yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">
        Conversion Rate by Salesperson
      </p>
      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.userId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-800 truncate max-w-[60%]">{s.name}</span>
              <span className="text-sm font-bold text-indigo-600">
                {s.conversionRate.toFixed(0)}%
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all"
                style={{ width: `${Math.min(s.conversionRate, 100)}%` }}
              />
            </div>
            <div className="flex gap-3 mt-1">
              <span className="text-[11px] text-gray-400">{s.total} leads</span>
              <span className="text-[11px] text-green-600">{s.closedWon} won</span>
              <span className="text-[11px] text-red-400">{s.closedLost} lost</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
