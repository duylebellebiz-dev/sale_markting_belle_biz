import { useNavigate } from 'react-router-dom';
import type { OverdueInvoice } from './dashboardApi';

interface Props { invoices: OverdueInvoice[] }

function daysOverdue(iso?: string) {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d > 0 ? d : null;
}

export default function OverdueInvoicesList({ invoices }: Props) {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Overdue Invoices
          {invoices.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
              {invoices.length}
            </span>
          )}
        </p>
        <button
          onClick={() => navigate('/invoices')}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          View all &gt;
        </button>
      </div>

      {invoices.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">No overdue invoices.</p>
      ) : (
        <div className="space-y-2">
          {invoices.map((inv) => {
            const over = daysOverdue(inv.invoiceDate);
            return (
              <div
                key={inv.id}
                onClick={() => navigate('/invoices')}
                className="flex items-center justify-between p-3 rounded-xl bg-red-50 hover:bg-red-100 cursor-pointer transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    #{inv.invoiceNumber}
                    {inv.customerName && (
                      <span className="ml-1 text-gray-500 font-normal">- {inv.customerName}</span>
                    )}
                  </p>
                  {over !== null && (
                    <p className="text-[11px] text-red-500">{over}d overdue</p>
                  )}
                </div>
                <span className="ml-3 text-sm font-bold text-red-600 whitespace-nowrap">
                  ${(inv.total ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
