import { INVOICE_STATUS_LABELS, type InvoiceStatus } from './invoicesApi';

const STYLES: Record<InvoiceStatus, string> = {
  Draft:         'bg-gray-100 text-gray-600',
  Sent:          'bg-blue-100 text-blue-700',
  PartiallyPaid: 'bg-amber-100 text-amber-700',
  Paid:          'bg-green-100 text-green-700',
  Overdue:       'bg-red-100 text-red-700',
  Cancelled:     'bg-gray-100 text-gray-400 line-through',
};

export default function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {INVOICE_STATUS_LABELS[status] ?? status}
    </span>
  );
}
