import { useCallback, useEffect, useRef, useState } from 'react';
import { servicesApi, type Service, type ServicePayload } from './servicesApi';

interface State {
  services: Service[];
  loading: boolean;
  error: string | null;
}

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

export function useServices() {
  const [state, setState] = useState<State>({ services: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const services = await servicesApi.list();
      setState({ services, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: extractError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const create = useCallback(async (payload: ServicePayload) => {
    const created = await servicesApi.create(payload);
    setState((s) => ({ ...s, services: [created, ...s.services] }));
    return created;
  }, []);

  const update = useCallback(async (id: string, payload: Partial<ServicePayload>) => {
    const updated = await servicesApi.update(id, payload);
    setState((s) => ({
      ...s,
      services: s.services.map((svc) => (svc.id === id ? updated : svc)),
    }));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await servicesApi.remove(id);
    setState((s) => ({ ...s, services: s.services.filter((svc) => svc.id !== id) }));
  }, []);

  return { ...state, reload: load, create, update, remove };
}
