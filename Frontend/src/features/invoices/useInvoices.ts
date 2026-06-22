import { useCallback, useEffect, useRef, useState } from 'react';
import {
  invoicesApi,
  type Invoice,
  type CreateInvoicePayload,
  type AddPaymentPayload,
} from './invoicesApi';

interface State {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
}

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join(', ');
  return msg ?? 'Something went wrong.';
}

export function useInvoices() {
  const [state, setState] = useState<State>({ invoices: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const invoices = await invoicesApi.list();
      setState({ invoices, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: extractError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  function patch(updated: Invoice) {
    setState((s) => ({
      ...s,
      invoices: s.invoices.map((inv) => (inv.id === updated.id ? updated : inv)),
    }));
  }

  const create = useCallback(async (payload: CreateInvoicePayload) => {
    const created = await invoicesApi.create(payload);
    setState((s) => ({ ...s, invoices: [created, ...s.invoices] }));
    return created;
  }, []);

  const update = useCallback(
    async (id: string, payload: Parameters<typeof invoicesApi.update>[1]) => {
      const updated = await invoicesApi.update(id, payload);
      patch(updated);
      return updated;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    await invoicesApi.remove(id);
    setState((s) => ({ ...s, invoices: s.invoices.filter((inv) => inv.id !== id) }));
  }, []);

  const markSent = useCallback(async (id: string) => {
    const updated = await invoicesApi.markSent(id);
    patch(updated);
    return updated;
  }, []);

  const markPaid = useCallback(async (id: string, p: AddPaymentPayload) => {
    const updated = await invoicesApi.markPaid(id, p);
    patch(updated);
    return updated;
  }, []);

  const addPayment = useCallback(async (id: string, p: AddPaymentPayload) => {
    const updated = await invoicesApi.addPayment(id, p);
    patch(updated);
    return updated;
  }, []);

  const removePayment = useCallback(async (id: string, paymentId: string) => {
    const updated = await invoicesApi.removePayment(id, paymentId);
    patch(updated);
    return updated;
  }, []);

  const updatePromisedDate = useCallback(async (id: string, date?: string) => {
    const updated = await invoicesApi.updatePromisedDate(id, date);
    patch(updated);
    return updated;
  }, []);

  const markUnpaid = useCallback(async (id: string) => {
    const updated = await invoicesApi.markUnpaid(id);
    patch(updated);
    return updated;
  }, []);

  const cancel = useCallback(async (id: string) => {
    const updated = await invoicesApi.cancel(id);
    patch(updated);
    return updated;
  }, []);

  return {
    ...state,
    reload: load,
    create,
    update,
    remove,
    markSent,
    markPaid,
    addPayment,
    removePayment,
    updatePromisedDate,
    markUnpaid,
    cancel,
  };
}
