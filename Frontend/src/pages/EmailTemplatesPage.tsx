import { useState } from 'react';
import AppShell from '../components/AppShell';
import { useEmailTemplates, extractApiError } from '../features/email/useEmailTemplates';
import TemplateTypeBadge from '../features/email/TemplateTypeBadge';
import TemplateModal from '../features/email/TemplateModal';
import type { EmailTemplate, TemplatePayload } from '../features/email/emailTemplatesApi';
import { TEMPLATE_TYPE_LABELS, TEMPLATE_TYPES, type TemplateType } from '../features/email/emailTemplatesApi';

type FilterType = 'all' | TemplateType;

function Spinner() {
  return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function EmailTemplatesPage() {
  const { templates, loading, error, reload, create, update, remove } =
    useEmailTemplates();

  const [modalTarget, setModalTarget] = useState<EmailTemplate | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [search, setSearch] = useState('');

  /*  derived list  */
  const visible = templates.filter((t) => {
    if (filterType !== 'all' && t.type !== filterType) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        t.name.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        TEMPLATE_TYPE_LABELS[t.type].toLowerCase().includes(q)
      );
    }
    return true;
  });

  /*  handlers  */
  async function handleSave(payload: TemplatePayload) {
    setActionError(null);
    if (modalTarget === 'new') {
      await create(payload);
    } else if (modalTarget) {
      await update(modalTarget.id, payload);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setActionError(null);
    try {
      await remove(id);
    } catch (err) {
      setActionError(extractApiError(err));
    }
  }

  /*  render  */
  return (
    <AppShell title="Email Templates">
      <div className="max-w-5xl mx-auto space-y-5">

        {/*  Page header  */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Email Templates</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Reusable email templates with personalisation variables - owner only.
            </p>
          </div>
          <button
            onClick={() => { setModalTarget('new'); setActionError(null); }}
            className="shrink-0 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            + New Template
          </button>
        </div>

        {/*  Action error  */}
        {actionError && (
          <div className="flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}

        {/*  Filters + search  */}
        {!loading && !error && (
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Type filter chips */}
            <div className="flex flex-wrap gap-1.5">
              {(['all', ...TEMPLATE_TYPES] as FilterType[]).map((ft) => (
                <button
                  key={ft}
                  onClick={() => setFilterType(ft)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                    filterType === ft
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600',
                  ].join(' ')}
                >
                  {ft === 'all' ? 'All' : TEMPLATE_TYPE_LABELS[ft]}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="sm:ml-auto">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-56"
              />
            </div>
          </div>
        )}

        {/*  Loading  */}
        {loading && <Spinner />}

        {/*  Fetch error  */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-12 text-center">
            <p className="text-red-700 font-medium mb-3">{error}</p>
            <button
              onClick={reload}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {/*  Template grid  */}
        {!loading && !error && (
          <>
            {visible.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
                <p className="text-gray-400 text-sm mb-3">
                  {templates.length === 0
                    ? 'No templates yet - create your first one.'
                    : 'No templates match your filter.'}
                </p>
                {templates.length === 0 && (
                  <button
                    onClick={() => setModalTarget('new')}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
                  >
                    + New Template
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((tmpl) => (
                  <TemplateCard
                    key={tmpl.id}
                    template={tmpl}
                    confirmingDelete={confirmDeleteId === tmpl.id}
                    onEdit={() => { setModalTarget(tmpl); setActionError(null); }}
                    onDeleteRequest={() => setConfirmDeleteId(tmpl.id)}
                    onDeleteConfirm={() => handleDelete(tmpl.id)}
                    onDeleteCancel={() => setConfirmDeleteId(null)}
                  />
                ))}
              </div>
            )}

            {/* Count summary */}
            {templates.length > 0 && (
              <p className="text-xs text-gray-400 text-right">
                Showing {visible.length} of {templates.length} template{templates.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        )}
      </div>

      {/*  Modal  */}
      {modalTarget !== null && (
        <TemplateModal
          initial={modalTarget === 'new' ? null : modalTarget}
          onSave={handleSave}
          onClose={() => setModalTarget(null)}
        />
      )}
    </AppShell>
  );
}

/*  Template card  */

interface CardProps {
  template: EmailTemplate;
  confirmingDelete: boolean;
  onEdit: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function TemplateCard({
  template: tmpl,
  confirmingDelete,
  onEdit,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: CardProps) {
  /* Strip HTML tags for the body preview */
  const previewText = tmpl.bodyHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return (
    <div className="flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Coloured top strip keyed to template type */}
      <TypeStripe type={tmpl.type} />

      <div className="flex-1 px-4 py-4 space-y-2">
        {/* Badge + name */}
        <div className="flex items-start justify-between gap-2">
          <TemplateTypeBadge type={tmpl.type} />
          <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtDate(tmpl.updatedAt)}</span>
        </div>

        <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-1">
          {tmpl.name}
        </h3>

        {/* Subject */}
        <p className="text-xs text-gray-500 line-clamp-1">
          <span className="font-medium text-gray-600">Subject: </span>
          {tmpl.subject}
        </p>

        {/* Body preview */}
        {previewText && (
          <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
            {previewText}
            {previewText.length >= 120 ? '...' : ''}
          </p>
        )}
      </div>

      {/* Card footer */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50">
        <button
          onClick={onEdit}
          className="text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          Edit
        </button>

        {confirmingDelete ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-gray-500">Delete?</span>
            <button onClick={onDeleteConfirm} className="font-medium text-red-600 hover:underline">Yes</button>
            <button onClick={onDeleteCancel} className="text-gray-500 hover:underline">No</button>
          </div>
        ) : (
          <button
            onClick={onDeleteRequest}
            className="text-xs font-medium text-red-400 hover:text-red-600 transition-colors"
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

/*  Thin colour strip at top of card  */
const STRIPE_COLORS: Record<TemplateType, string> = {
  welcome:          'bg-green-400',
  followup:         'bg-blue-400',
  invoice_reminder: 'bg-orange-400',
  renewal:          'bg-purple-400',
  thank_you:        'bg-pink-400',
  custom:           'bg-gray-300',
};

function TypeStripe({ type }: { type: TemplateType }) {
  return <div className={`h-1 w-full ${STRIPE_COLORS[type]}`} />;
}
