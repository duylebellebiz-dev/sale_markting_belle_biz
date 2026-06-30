import { useEffect, useRef, useState } from 'react';
import AppShell from '../components/AppShell';
import { useServices } from '../features/services/useServices';
import type { Service, ServicePayload } from '../features/services/servicesApi';

type EditTarget = 'new' | string; // 'new' = add row, string = service _id

const INPUT = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full';

export default function ServicesPage() {
  const { services, loading, error, reload, create, update, remove } = useServices();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function extractError(err: unknown) {
    const msg = (err as { response?: { data?: { message?: string | string[] } } })
      ?.response?.data?.message;
    return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Action failed.');
  }

  async function handleSave(payload: ServicePayload, id?: string) {
    setActionError(null);
    try {
      if (id) {
        await update(id, payload);
      } else {
        await create(payload);
      }
      setEditing(null);
    } catch (err) {
      setActionError(extractError(err));
    }
  }

  async function handleRemove(id: string) {
    setConfirmDeleteId(null);
    setActionError(null);
    try {
      await remove(id);
    } catch (err) {
      setActionError(extractError(err));
    }
  }

  async function handleToggle(svc: Service) {
    setActionError(null);
    try {
      await update(svc.id, { isActive: !svc.isActive });
    } catch (err) {
      setActionError(extractError(err));
    }
  }

  return (
    <AppShell title="Services">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Services</h2>
            <p className="text-sm text-gray-500 mt-0.5">Company service catalog - owner only</p>
          </div>
          {editing !== 'new' && (
            <button
              onClick={() => setEditing('new')}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              + Add Service
            </button>
          )}
        </div>

        {/* Action error */}
        {actionError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center justify-between">
            {actionError}
            <button onClick={() => setActionError(null)} className="ml-4 text-red-400 hover:text-red-600"></button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          </div>
        )}

        {/* Fetch error */}
        {!loading && error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-6 py-10 text-center">
            <p className="text-red-700 font-medium mb-3">{error}</p>
            <button onClick={reload} className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm hover:bg-red-700 transition-colors">Retry</button>
          </div>
        )}

        {!loading && !error && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
            {/* Add-new inline row */}
            {editing === 'new' && (
              <ServiceFormRow
                onSave={(p) => handleSave(p)}
                onCancel={() => setEditing(null)}
              />
            )}

            {/* Empty state */}
            {services.length === 0 && editing !== 'new' && (
              <div className="px-6 py-14 text-center text-gray-400">
                <p className="text-sm">No services yet. Click <strong>+ Add Service</strong> to create the first one.</p>
              </div>
            )}

            {/* Service rows */}
            {services.map((svc) =>
              editing === svc.id ? (
                <ServiceFormRow
                  key={svc.id}
                  initial={svc}
                  onSave={(p) => handleSave(p, svc.id)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <ServiceRow
                  key={svc.id}
                  service={svc}
                  confirmingDelete={confirmDeleteId === svc.id}
                  onEdit={() => { setEditing(svc.id); setConfirmDeleteId(null); }}
                  onToggle={() => handleToggle(svc)}
                  onDeleteRequest={() => setConfirmDeleteId(svc.id)}
                  onDeleteConfirm={() => handleRemove(svc.id)}
                  onDeleteCancel={() => setConfirmDeleteId(null)}
                />
              ),
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

/*  Service row (view mode)  */

interface ServiceRowProps {
  service: Service;
  confirmingDelete: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDeleteRequest: () => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

function ServiceRow({
  service,
  confirmingDelete,
  onEdit,
  onToggle,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}: ServiceRowProps) {
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      {/* Active toggle */}
      <button
        onClick={onToggle}
        title={service.isActive ? 'Active - click to deactivate' : 'Inactive - click to activate'}
        className={[
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500',
          service.isActive ? 'bg-indigo-600' : 'bg-gray-300',
        ].join(' ')}
      >
        <span
          className={[
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            service.isActive ? 'translate-x-4' : 'translate-x-0',
          ].join(' ')}
        />
      </button>

      {/* Name + status label */}
      <div className="flex-1 min-w-0">
        <span className={`font-medium ${service.isActive ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
          {service.name}
        </span>
        {!service.isActive && (
          <span className="ml-2 text-xs text-gray-400">(inactive)</span>
        )}
      </div>

      {/* Price */}
      <span className="text-gray-700 font-medium tabular-nums whitespace-nowrap">
        ${service.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-2">
        {confirmingDelete ? (
          <>
            <span className="text-xs text-gray-600">Delete?</span>
            <button onClick={onDeleteConfirm} className="text-xs text-red-600 font-medium hover:underline">Yes</button>
            <button onClick={onDeleteCancel} className="text-xs text-gray-500 hover:underline">No</button>
          </>
        ) : (
          <>
            <button onClick={onEdit} className="text-xs text-gray-500 font-medium hover:text-gray-800 transition-colors">Edit</button>
            <button onClick={onDeleteRequest} className="text-xs text-red-400 font-medium hover:text-red-700 transition-colors">Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

/*  Inline form row (add / edit)  */

interface ServiceFormRowProps {
  initial?: Service;
  onSave: (payload: ServicePayload) => Promise<void>;
  onCancel: () => void;
}

function ServiceFormRow({ initial, onSave, onCancel }: ServiceFormRowProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [price, setPrice] = useState(initial ? String(initial.price) : '');
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  async function handleSave() {
    setErr(null);
    if (!name.trim()) { setErr('Name is required.'); return; }
    const p = parseFloat(price);
    if (isNaN(p)) { setErr('Enter a valid price.'); return; }
    setSubmitting(true);
    try {
      await onSave({ name: name.trim(), price: p, isActive });
    } catch {
      // parent handles error display; just re-enable
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') onCancel();
  }

  return (
    <div className="px-5 py-4 bg-indigo-50 space-y-3">
      {err && <p className="text-xs text-red-600">{err}</p>}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Service Name *</label>
          <input
            ref={nameRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className={INPUT}
            placeholder="e.g. Web Design Package"
          />
        </div>

        <div className="flex flex-col gap-1 w-36">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Price *</label>
          <input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            onKeyDown={handleKeyDown}
            className={INPUT}
            placeholder="0.00 (negative for discount)"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Active</label>
          <button
            type="button"
            onClick={() => setIsActive((v) => !v)}
            className={[
              'relative inline-flex h-5 w-9 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500',
              isActive ? 'bg-indigo-600' : 'bg-gray-300',
            ].join(' ')}
          >
            <span className={['inline-block h-4 w-4 rounded-full bg-white shadow transition-transform', isActive ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
          </button>
        </div>

        <div className="flex gap-2 pb-0.5">
          <button
            onClick={handleSave}
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Saving...' : initial ? 'Save' : 'Add'}
          </button>
          <button
            onClick={onCancel}
            type="button"
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-white transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
