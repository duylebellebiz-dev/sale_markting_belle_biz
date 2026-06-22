import type { SalespersonKpis } from './dashboardApi';

interface Props { kpis: SalespersonKpis }

export default function KpiRow({ kpis }: Props) {
  if (!kpis) return null;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">My KPIs</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi label="Total Customers" value={String(kpis.totalCustomers)} />
        <Kpi label="Closed Won"      value={String(kpis.closedWon)}      color="text-green-600" />
        <Kpi label="Closed Lost"     value={String(kpis.closedLost)}     color="text-red-500" />
        <Kpi
          label="Conversion Rate"
          value={`${kpis.conversionRate}%`}
          color={kpis.conversionRate >= 30 ? 'text-green-600' : kpis.conversionRate >= 10 ? 'text-yellow-600' : 'text-gray-700'}
        />
      </div>

      {/* Total revenue callout */}
      <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Total Revenue (all time)</span>
        <span className="text-lg font-bold text-indigo-600">
          ${kpis.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 0 })}
        </span>
      </div>

      {/* Win / loss bar */}
      {kpis.totalCustomers > 0 && (
        <div className="mt-3">
          <div className="flex h-2 rounded-full overflow-hidden bg-gray-100">
            {kpis.closedWon > 0 && (
              <div
                className="bg-green-400 transition-all"
                style={{ width: `${(kpis.closedWon / kpis.totalCustomers) * 100}%` }}
              />
            )}
            {kpis.closedLost > 0 && (
              <div
                className="bg-red-300 transition-all"
                style={{ width: `${(kpis.closedLost / kpis.totalCustomers) * 100}%` }}
              />
            )}
          </div>
          <div className="flex gap-4 mt-1.5">
            <span className="text-[11px] text-green-600">■ Won</span>
            <span className="text-[11px] text-red-400">■ Lost</span>
            <span className="text-[11px] text-gray-300">■ Active</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, color = 'text-gray-800' }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}
