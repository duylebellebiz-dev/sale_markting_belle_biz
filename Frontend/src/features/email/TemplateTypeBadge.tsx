import { TEMPLATE_TYPE_LABELS, type TemplateType } from './emailTemplatesApi';

const COLORS: Record<TemplateType, string> = {
  welcome:          'bg-green-100 text-green-700',
  followup:         'bg-blue-100 text-blue-700',
  invoice_reminder: 'bg-orange-100 text-orange-700',
  renewal:          'bg-purple-100 text-purple-700',
  thank_you:        'bg-pink-100 text-pink-700',
  custom:           'bg-gray-100 text-gray-600',
};

export default function TemplateTypeBadge({ type }: { type: TemplateType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[type]}`}
    >
      {TEMPLATE_TYPE_LABELS[type]}
    </span>
  );
}
