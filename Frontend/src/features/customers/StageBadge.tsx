import type { PipelineStage } from './customersApi';

const STAGE_STYLES: Record<PipelineStage, string> = {
  'Lead':          'bg-gray-100 text-gray-700',
  'Contacted':     'bg-blue-100 text-blue-700',
  'Interested':    'bg-yellow-100 text-yellow-700',
  'Proposal Sent': 'bg-orange-100 text-orange-700',
  'Negotiation':   'bg-purple-100 text-purple-700',
  'Closed Won':    'bg-green-100 text-green-700',
  'Closed Lost':   'bg-red-100 text-red-600',
};

export default function StageBadge({ stage }: { stage: PipelineStage }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${STAGE_STYLES[stage] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {stage}
    </span>
  );
}
