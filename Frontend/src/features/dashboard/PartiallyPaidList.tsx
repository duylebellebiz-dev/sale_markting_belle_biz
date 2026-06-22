import { useNavigate } from 'react-router-dom';
import type { PartiallyPaidInvoice } from './dashboardApi';

function money(n: number) {
  return n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  invoices: PartiallyPaidInvoice[];
}

export default function PartiallyPaidList({ invoices }: Props) {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl border border-amber-200 bg-white shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">Partially Paid Invoices</h3>
          <p className="text-xs text-amber-600 mt-0.5">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} with outstanding balances</p>
        </div>
        <span className="text-2xl font-bold text-amber-700">{invoices.length}</span>
      </div>

      {invoices.length === 0 ? (
        <p className="px-5 py-8 text-sm text-gray-400 text-center">No partially paid invoices.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {invoices.map((inv) => {
            const pct = inv.total > 0 ? Math.round((inv.amountPaid / inv.total) * 100) : 0;
            return (
              <li key={inv.id}>
                <button
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  className="w-full text-left px-5 py-3.5 hover:bg-amber-50/60 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {inv.shopName || inv.customerName || '-'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">#{inv.invoiceNumber}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-700">${money(inv.balanceDue)} due</p>
                      <p className="text-xs text-gray-400">${money(inv.amountPaid)} of ${money(inv.total)} paid</p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{pct}% paid</p>

                  {inv.promisedPaymentDate && (
                    <p className="text-xs text-blue-500 mt-1">
                      Promise: {new Date(inv.promisedPaymentDate).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
