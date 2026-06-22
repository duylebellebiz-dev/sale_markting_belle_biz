import { useCallback, useEffect, useRef, useState } from 'react';
import { staffApi, type StaffMember, type CreateStaffPayload, type UpdateStaffPayload } from './staffApi';

interface State {
  staff: StaffMember[];
  loading: boolean;
  error: string | null;
}

function extractError(err: unknown): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

export function useStaff() {
  const [state, setState] = useState<State>({ staff: [], loading: true, error: null });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const staff = await staffApi.list();
      setState({ staff, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: extractError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const create = useCallback(async (payload: CreateStaffPayload) => {
    const created = await staffApi.create(payload);
    setState((s) => ({ ...s, staff: [created, ...s.staff] }));
    return created;
  }, []);

  const update = useCallback(async (id: string, payload: UpdateStaffPayload) => {
    const updated = await staffApi.update(id, payload);
    setState((s) => ({
      ...s,
      staff: s.staff.map((m) => (m.id === id ? updated : m)),
    }));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await staffApi.remove(id);
    setState((s) => ({ ...s, staff: s.staff.filter((m) => m.id !== id) }));
  }, []);

  return { ...state, reload: load, create, update, remove };
}
