import { useCallback, useEffect, useRef, useState } from 'react';
import {
  emailTemplatesApi,
  type EmailTemplate,
  type TemplatePayload,
} from './emailTemplatesApi';

interface State {
  templates: EmailTemplate[];
  loading: boolean;
  error: string | null;
}

export function extractApiError(err: unknown): string {
  const msg = (
    err as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;
  return Array.isArray(msg) ? msg.join(', ') : (msg ?? 'Something went wrong.');
}

export function useEmailTemplates() {
  const [state, setState] = useState<State>({
    templates: [],
    loading: true,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const templates = await emailTemplatesApi.list();
      setState({ templates, loading: false, error: null });
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: extractApiError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  const create = useCallback(async (payload: TemplatePayload) => {
    const created = await emailTemplatesApi.create(payload);
    setState((s) => ({ ...s, templates: [created, ...s.templates] }));
    return created;
  }, []);

  const update = useCallback(async (id: string, payload: Partial<TemplatePayload>) => {
    const updated = await emailTemplatesApi.update(id, payload);
    setState((s) => ({
      ...s,
      templates: s.templates.map((t) => (t.id === id ? updated : t)),
    }));
    return updated;
  }, []);

  const remove = useCallback(async (id: string) => {
    await emailTemplatesApi.remove(id);
    setState((s) => ({
      ...s,
      templates: s.templates.filter((t) => t.id !== id),
    }));
  }, []);

  return { ...state, reload: load, create, update, remove };
}
