import { useCallback, useEffect, useState } from 'react';
import { dashboardApi, type OwnerDashboardData, type SalespersonDashboardData } from './dashboardApi';
import { DEFAULT_RANGE, type DateRange } from './periodUtils';

type DashState<T> = { data: T | null; loading: boolean; error: string | null };

function init<T>(): DashState<T> {
  return { data: null, loading: true, error: null };
}

export function useOwnerDashboard(range: DateRange = DEFAULT_RANGE) {
  const [state, setState] = useState<DashState<OwnerDashboardData>>(init);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const to = range.from === 'all' ? undefined : range.to;
      const data = await dashboardApi.owner(range.from, to);
      setState({ data, loading: false, error: null });
    } catch {
      setState({ data: null, loading: false, error: 'Failed to load dashboard.' });
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

export function useSalespersonDashboard(range: DateRange = DEFAULT_RANGE) {
  const [state, setState] = useState<DashState<SalespersonDashboardData>>(init);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const to = range.from === 'all' ? undefined : range.to;
      const data = await dashboardApi.salesperson(range.from, to);
      setState({ data, loading: false, error: null });
    } catch {
      setState({ data: null, loading: false, error: 'Failed to load dashboard.' });
    }
  }, [range.from, range.to]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}
