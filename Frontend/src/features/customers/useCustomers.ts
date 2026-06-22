import { useCallback, useEffect, useRef, useState } from 'react';
import { customersApi, type Customer, type CustomerPayload, type StaffUser } from './customersApi';
import { useAuth } from '../../context/AuthContext';

interface State {
  customers: Customer[];
  staff: StaffUser[];
  loading: boolean;
  error: string | null;
}

export function useCustomers() {
  const { user } = useAuth();
  const isOwner = user?.role === 'owner';
  const [state, setState] = useState<State>({
    customers: [],
    staff: [],
    loading: true,
    error: null,
  });

  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [customers, staff] = await Promise.all([
        customersApi.list(),
        isOwner ? customersApi.listStaff() : Promise.resolve([] as StaffUser[]),
      ]);
      setState({ customers, staff, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data?.message ??
        'Failed to load customers';
      setState((s) => ({ ...s, loading: false, error: msg }));
    }
  }, [isOwner]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const create = useCallback(async (payload: CustomerPayload) => {
    const created = await customersApi.create(payload);
    setState((s) => ({ ...s, customers: [created, ...s.customers] }));
    return created;
  }, []);

  const update = useCallback(async (id: string, payload: Partial<CustomerPayload>) => {
    const updated = await customersApi.update(id, payload);
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? updated : c)),
    }));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await customersApi.remove(id);
    setState((s) => ({ ...s, customers: s.customers.filter((c) => c.id !== id) }));
  }, []);

  const scheduleFollowUp = useCallback(
    async (id: string, nextFollowUpAt: string, note?: string) => {
      const updated = await customersApi.reschedule(id, nextFollowUpAt, note);
      setState((s) => ({
        ...s,
        customers: s.customers.map((c) => (c.id === id ? updated : c)),
      }));
      return updated;
    },
    [],
  );

  const markClosedLost = useCallback(async (id: string, note?: string) => {
    const updated = await customersApi.closeLost(id, note);
    setState((s) => ({
      ...s,
      customers: s.customers.map((c) => (c.id === id ? updated : c)),
    }));
    return updated;
  }, []);

  return {
    ...state,
    isOwner,
    reload: load,
    create,
    update,
    remove,
    scheduleFollowUp,
    markClosedLost,
  };
}
