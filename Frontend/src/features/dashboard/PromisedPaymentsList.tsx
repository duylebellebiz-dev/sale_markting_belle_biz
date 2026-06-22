import { useNavigate } from 'react-router-dom';
import type { PromisedPaymentDue } from './dashboardApi';

function money(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function daysLabel(iso: string): { text: string; urgent: boolean } {
  const diff = Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (diff < 0)  return { text: `${Math.abs(diff)}d overdue`, urgent: true };
  if (diff === 0) return { text: 'Due today', urgent: true };
  if (diff === 1) return { text: 'Tomorrow', urgent: true };
  return { text: `In ${diff}d`, urgent: false };
}

interface Props {
  promises: PromisedPaymentDue[];
}

export default function PromisedPaymentsList({ promises }: Props) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-blue-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-blue-100 bg-blue-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-blue-900">Promised Payments (14-day window)</h3>
          <p className="text-xs text-blue-600 mt-0.5">
            {promises.length} invoice{promises.length !== 1 ? 's' : ''} with payment commitments
          </p>
        </div>
        <span className="text-2xl font-bold text-blue-700">{promises.length}</span>
      </div>

      {promises.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">No upcoming payment promises.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {promises.map((inv) => {
            const { text, urgent } = daysLabel(inv.promisedPaymentDate);
            return (
              <li key={inv.id}>
                <button
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="w-full text-left px-5 py-3.5 hover:bg-blue-50/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {inv.shopName || inv.customerName || '-'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">#{inv.invoiceNumber} - {inv.status}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-gray-900">${money(inv.balanceDue)}</p>
                      <span className={`text-xs font-semibold ${urgent ? 'text-red-600' : 'text-blue-600'}`}>
                        {text}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Promised: {fmtDate(inv.promisedPaymentDate)}
                  </p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
