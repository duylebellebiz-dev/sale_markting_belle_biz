import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useAuth } from '../context/AuthContext';
import { useOwnerDashboard, useSalespersonDashboard } from '../features/dashboard/useDashboard';
import RevenueBarChart from '../features/dashboard/RevenueBarChart';
import ConversionTable from '../features/dashboard/ConversionTable';
import OverdueInvoicesList from '../features/dashboard/OverdueInvoicesList';
import ExpiringSubsList from '../features/dashboard/ExpiringSubsList';
import PartiallyPaidList from '../features/dashboard/PartiallyPaidList';
import PromisedPaymentsList from '../features/dashboard/PromisedPaymentsList';
import PipelineFunnel from '../features/dashboard/PipelineFunnel';
import KpiRow from '../features/dashboard/KpiRow';
import TodaysTasks from '../features/dashboard/TodaysTasks';
import PeriodSelector from '../features/dashboard/PeriodSelector';
import { DEFAULT_RANGE, type DateRange } from '../features/dashboard/periodUtils';

export default function DashboardPage() {
  const { user } = useAuth();
  return user?.role === 'owner' ? <OwnerDashboard /> : <SalespersonDashboard />;
}

/* ─── Owner ───────────────────────────────────────────────────────────────── */

function OwnerDashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const { data, loading, error, reload } = useOwnerDashboard(range);

  return (
    <AppShell title="Dashboard">
      <div className="max-w-6xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Owner Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, {user?.fullName || user?.email}
          </p>
        </div>

        {/* Period selector */}
        <PeriodSelector value={range} onChange={setRange} />

        {loading && <Spinner />}
        {!loading && error && <ErrorBanner msg={error} onRetry={reload} />}

        {!loading && data && (
          <>
            {/* KPI row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <StatCard
                label="Revenue"
                value={`$${data.monthlyRevenue.toLocaleString()}`}
                note={`In ${range.label}`}
                accent="indigo"
              />
              <StatCard
                label="Active Deals"
                value={String(data.activeDeals)}
                note={data.isAllTime ? 'All open deals' : `New in ${range.label}`}
                accent="blue"
              />
              <StatCard
                label="Outstanding Balance"
                value={`$${(data.totalOutstandingBalance ?? 0).toLocaleString('en-CA', { maximumFractionDigits: 0 })}`}
                note={data.isAllTime ? 'All invoices' : `Invoices in ${range.label}`}
                accent={(data.totalOutstandingBalance ?? 0) > 0 ? 'orange' : 'green'}
              />
              <StatCard
                label="Overdue Invoices"
                value={String(data.overdueInvoices.length)}
                note={data.isAllTime ? 'All time' : `In ${range.label}`}
                accent={data.overdueInvoices.length > 0 ? 'red' : 'green'}
              />
              <StatCard
                label="Expiring (30d)"
                value={String(data.expiringSubscriptions.length)}
                note="Next 30 days"
                accent={data.expiringSubscriptions.length > 0 ? 'yellow' : 'green'}
              />
            </div>

            {/* Partially paid + promised payments */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PartiallyPaidList invoices={data.partiallyPaidInvoices ?? []} />
              <PromisedPaymentsList promises={data.promisedPaymentsDue ?? []} />
            </div>

            {/* Revenue chart — uses period metadata from backend */}
            <RevenueBarChart
              data={data.revenueByMonth}
              title={`Revenue — ${range.label}`}
              bucketType={data.bucketType ?? 'monthly'}
              periodFrom={data.isAllTime ? undefined : data.resolvedFrom?.slice(0, 10)}
              periodTo={data.isAllTime ? undefined : data.resolvedTo?.slice(0, 10)}
            />

            {/* Conversion table + overdue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ConversionTable stats={data.salespersonStats} />
              <OverdueInvoicesList invoices={data.overdueInvoices} />
            </div>

            {/* Expiring subscriptions */}
            <ExpiringSubsList subs={data.expiringSubscriptions} />
          </>
        )}
      </div>
    </AppShell>
  );
}

/* ─── Salesperson ─────────────────────────────────────────────────────────── */

function SalespersonDashboard() {
  const { user } = useAuth();
  const [range, setRange] = useState<DateRange>(DEFAULT_RANGE);
  const { data, loading, error, reload } = useSalespersonDashboard(range);
  const navigate = useNavigate();

  return (
    <AppShell title="Dashboard">
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Dashboard</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Welcome back, {user?.fullName || user?.email}
          </p>
        </div>

        {/* Period selector */}
        <PeriodSelector value={range} onChange={setRange} />

        {loading && <Spinner />}
        {!loading && error && <ErrorBanner msg={error} onRetry={reload} />}

        {!loading && data && (() => {
          const safe = {
            myCustomers:     data.myCustomers     ?? 0,
            followUpsToday:  data.followUpsToday  ?? 0,
            openInvoices:    data.openInvoices    ?? 0,
            renewalsDueSoon: data.renewalsDueSoon ?? 0,
            kpis: data.kpis ?? { totalCustomers: 0, closedWon: 0, closedLost: 0, conversionRate: 0, totalRevenue: 0 },
            pipelineBreakdown: data.pipelineBreakdown ?? [],
            dueFollowUps:      data.dueFollowUps      ?? [],
            openInvoicesList:  data.openInvoicesList  ?? [],
            expiringSubsList:  data.expiringSubsList  ?? [],
            myRevenueByMonth:  data.myRevenueByMonth  ?? [],
          };
          return (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="My Customers"
                  value={String(safe.myCustomers)}
                  note="Total assigned"
                  accent="indigo"
                  onClick={() => navigate('/customers')}
                />
                <StatCard
                  label="Follow-ups Due"
                  value={String(safe.followUpsToday)}
                  note="Today"
                  accent={safe.followUpsToday > 0 ? 'yellow' : 'blue'}
                  onClick={() => navigate('/customers')}
                />
                <StatCard
                  label="Open Invoices"
                  value={String(safe.openInvoices)}
                  note={data.isAllTime ? 'All time' : `In ${range.label}`}
                  accent={safe.openInvoices > 0 ? 'red' : 'green'}
                  onClick={() => navigate('/invoices')}
                />
                <StatCard
                  label="Renewals Due (30d)"
                  value={String(safe.renewalsDueSoon)}
                  note="Next 30 days"
                  accent={safe.renewalsDueSoon > 0 ? 'orange' : 'green'}
                  onClick={() => navigate('/subscriptions')}
                />
              </div>

              {/* KPIs */}
              <KpiRow kpis={safe.kpis} />

              {/* Today's tasks + pipeline */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <TodaysTasks
                  followUps={safe.dueFollowUps}
                  invoices={safe.openInvoicesList}
                  expiring={safe.expiringSubsList}
                />
                <PipelineFunnel breakdown={safe.pipelineBreakdown} />
              </div>

              {/* Revenue chart */}
              <RevenueBarChart
                data={safe.myRevenueByMonth}
                title={`My Revenue — ${range.label}`}
                bucketType={data.bucketType ?? 'monthly'}
                periodFrom={data.isAllTime ? undefined : data.resolvedFrom?.slice(0, 10)}
                periodTo={data.isAllTime ? undefined : data.resolvedTo?.slice(0, 10)}
              />
            </>
          );
        })()}
      </div>
    </AppShell>
  );
}

/* ─── Shared primitives ───────────────────────────────────────────────────── */

type Accent = 'indigo' | 'blue' | 'green' | 'red' | 'yellow' | 'orange';

const ACCENT_STYLES: Record<Accent, string> = {
  indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  blue:   'border-blue-200   bg-blue-50   text-blue-700',
  green:  'border-green-200  bg-green-50  text-green-700',
  red:    'border-red-200    bg-red-50    text-red-700',
  yellow: 'border-yellow-200 bg-yellow-50 text-yellow-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
};

function StatCard({
  label,
  value,
  accent,
  note,
  onClick,
}: {
  label: string;
  value: string;
  accent: Accent;
  note?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={[
        'rounded-2xl border p-5 shadow-sm',
        ACCENT_STYLES[accent],
        onClick ? 'cursor-pointer hover:brightness-95 transition-all' : '',
      ].join(' ')}
    >
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {note && <p className="text-[11px] opacity-60 mt-1">{note}</p>}
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function ErrorBanner({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <p className="text-red-700 font-medium mb-3">{msg}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
