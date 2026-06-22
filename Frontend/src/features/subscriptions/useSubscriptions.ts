import { useCallback, useEffect, useRef, useState } from 'react';
import {
  subscriptionsApi,
  type Subscription,
  type CreateSubscriptionPayload,
  type RenewPayload,
} from './subscriptionsApi';

interface State {
  subscriptions: Subscription[];
  loading: boolean;
  error: string | null;
}

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

export function useSubscriptions() {
  const [state, setState] = useState<State>({ subscriptions: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const subscriptions = await subscriptionsApi.list();
      setState({ subscriptions, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: extractError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  function patch(updated: Subscription) {
    setState((s) => ({
      ...s,
      subscriptions: s.subscriptions.map((sub) => (sub.id === updated.id ? updated : sub)),
    }));
  }

  const create = useCallback(async (payload: CreateSubscriptionPayload) => {
    const created = await subscriptionsApi.create(payload);
    setState((s) => ({ ...s, subscriptions: [created, ...s.subscriptions] }));
    return created;
  }, []);

  const renew = useCallback(async (id: string, payload: RenewPayload) => {
    const updated = await subscriptionsApi.renew(id, payload);
    patch(updated);
    return updated;
  }, []);

  const cancel = useCallback(async (id: string) => {
    const updated = await subscriptionsApi.cancel(id);
    patch(updated);
    return updated;
  }, []);

  return { ...state, reload: load, create, renew, cancel };
}
