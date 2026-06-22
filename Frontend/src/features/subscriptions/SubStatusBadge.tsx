import type { SubscriptionStatus } from './subscriptionsApi';

const STYLES: Record<SubscriptionStatus, string> = {
  Active:    'bg-green-100 text-green-700',
  Renewed:   'bg-blue-100 text-blue-700',
  Cancelled: 'bg-gray-100 text-gray-400',
  Expired:   'bg-red-100 text-red-600',
};

export default function SubStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STYLES[status]}`}>
      {status}
    </span>
  );
}
