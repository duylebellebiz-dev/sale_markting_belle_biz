import type { PipelineSlice } from './dashboardApi';

const STAGE_ORDER = [
  'Lead',
  'Contacted',
  'Interested',
  'Proposal Sent',
  'Negotiation',
  'Closed Won',
  'Closed Lost',
];

const STAGE_COLORS: Record<string, string> = {
  'Lead':          'bg-gray-300',
  'Contacted':     'bg-blue-300',
  'Interested':    'bg-yellow-300',
  'Proposal Sent': 'bg-orange-300',
  'Negotiation':   'bg-purple-300',
  'Closed Won':    'bg-green-400',
  'Closed Lost':   'bg-red-300',
};

const STAGE_TEXT: Record<string, string> = {
  'Lead':          'text-gray-700',
  'Contacted':     'text-blue-700',
  'Interested':    'text-yellow-700',
  'Proposal Sent': 'text-orange-700',
  'Negotiation':   'text-purple-700',
  'Closed Won':    'text-green-700',
  'Closed Lost':   'text-red-600',
};

interface Props { breakdown: PipelineSlice[] }

export default function PipelineFunnel({ breakdown }: Props) {
  if (!breakdown) return null;
  const map = Object.fromEntries(breakdown.map((s) => [s._id, s.count]));
  const total = breakdown.reduce((s, b) => s + b.count, 0);

  if (total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">My Pipeline</p>
        <p className="text-sm text-gray-400 text-center py-4">No active deals.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">My Pipeline</p>
      <div className="space-y-2">
        {STAGE_ORDER.map((stage) => {
          const count = map[stage] ?? 0;
          const pct   = total > 0 ? (count / total) * 100 : 0;
          return (
            <div key={stage} className="flex items-center gap-3">
              <span className={`text-xs font-medium w-28 shrink-0 ${STAGE_TEXT[stage] ?? 'text-gray-600'}`}>
                {stage}
              </span>
              <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                {count > 0 && (
                  <div
                    className={`h-full rounded-full transition-all ${STAGE_COLORS[stage] ?? 'bg-gray-300'}`}
                    style={{ width: `${Math.max(pct, 4)}%` }}
                  />
                )}
              </div>
              <span className="text-xs font-bold text-gray-700 w-5 text-right shrink-0">
                {count > 0 ? count : <span className="text-gray-300">—</span>}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-gray-400 mt-3 text-right">{total} total</p>
    </div>
  );
}
