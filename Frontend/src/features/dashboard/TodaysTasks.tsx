import { useNavigate } from 'react-router-dom';
import type { DueFollowUp, OpenInvoiceTask, ExpiringSubscription } from './dashboardApi';

interface Props {
  followUps: DueFollowUp[];
  invoices: OpenInvoiceTask[];
  expiring: ExpiringSubscription[];
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60)  return `${mins}m overdue`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h overdue`;
  return `${Math.floor(hrs / 24)}d overdue`;
}

function daysLabel(days: number) {
  if (days <= 0) return 'Expires today';
  if (days < 1)  return 'Expires today';
  return `${Math.ceil(days)}d left`;
}

export default function TodaysTasks({ followUps, invoices, expiring }: Props) {
  const navigate = useNavigate();
  const total = followUps.length + invoices.length + expiring.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Today's Tasks
          {total > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
              {total}
            </span>
          )}
        </p>
      </div>

      {total === 0 ? (
        <div className="py-8 text-center">
          <p className="text-2xl mb-1"></p>
          <p className="text-sm font-medium text-gray-600">All caught up!</p>
          <p className="text-xs text-gray-400 mt-0.5">No pending tasks right now.</p>
        </div>
      ) : (
        <div className="space-y-1">

          {/* Follow-ups */}
          {followUps.length > 0 && (
            <Section label="Follow-ups due" count={followUps.length} color="yellow">
              {followUps.map((c) => (
                <TaskRow
                  key={c.id}
                  icon=""
                  title={c.customerName}
                  sub={c.shopName}
                  badge={relativeTime(c.nextFollowUpAt)}
                  badgeColor="bg-yellow-100 text-yellow-700"
                  note={c.note}
                  onClick={() => navigate('/customers')}
                />
              ))}
            </Section>
          )}

          {/* Open invoices */}
          {invoices.length > 0 && (
            <Section label="Unpaid invoices" count={invoices.length} color="red">
              {invoices.map((inv) => (
                <TaskRow
                  key={inv.id}
                  icon=""
                  title={`#${inv.invoiceNumber}`}
                  sub={inv.customerName}
                  badge={inv.status}
                  badgeColor={inv.status === 'Overdue' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}
                  note={`$${(inv.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  onClick={() => navigate('/invoices')}
                />
              ))}
            </Section>
          )}

          {/* Expiring subscriptions */}
          {expiring.length > 0 && (
            <Section label="Renewals due" count={expiring.length} color="purple">
              {expiring.map((s) => (
                <TaskRow
                  key={s.id}
                  icon=""
                  title={s.customerName ?? '-'}
                  sub={s.serviceName}
                  badge={daysLabel(s.daysUntilExpiry)}
                  badgeColor={s.daysUntilExpiry <= 3 ? 'bg-red-100 text-red-700' : 'bg-purple-100 text-purple-700'}
                  onClick={() => navigate('/subscriptions')}
                />
              ))}
            </Section>
          )}

        </div>
      )}
    </div>
  );
}

function Section({
  label, count, color, children,
}: {
  label: string;
  count: number;
  color: 'yellow' | 'red' | 'purple';
  children: React.ReactNode;
}) {
  const dot: Record<string, string> = {
    yellow: 'bg-yellow-400',
    red: 'bg-red-400',
    purple: 'bg-purple-400',
  };
  return (
    <div className="mb-3">
      <div className="flex items-center gap-1.5 mb-1.5 px-1">
        <span className={`w-2 h-2 rounded-full ${dot[color]}`} />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          {label} ({count})
        </span>
      </div>
      {children}
    </div>
  );
}

function TaskRow({
  icon, title, sub, badge, badgeColor, note, onClick,
}: {
  icon: string;
  title: string;
  sub?: string;
  badge: string;
  badgeColor: string;
  note?: string;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 cursor-pointer transition-colors"
    >
      <span className="text-base shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{title}</p>
        {(sub || note) && (
          <p className="text-xs text-gray-400 truncate">{sub ?? note}</p>
        )}
      </div>
      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${badgeColor}`}>
        {badge}
      </span>
    </div>
  );
}
