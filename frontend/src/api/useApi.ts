import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './client';

interface UseApiOptions {
  pollMs?: number;
}

export function useApi<T>(path: string, options: UseApiOptions = {}) {
  const { pollMs } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scope = useRef<{ path: string; pending: AbortController | null } | null>(null);

  const load = useCallback((visible: boolean): Promise<T | null> => {
    const current = scope.current;
    if (!path || current?.path !== path) return Promise.resolve(null);
    current.pending?.abort();
    const controller = new AbortController();
    current.pending = controller;
    if (visible) {
      setLoading(true);
      setError(null);
    }
    const isCurrent = () => scope.current === current && !controller.signal.aborted;
    return api<T>(path, { signal: controller.signal })
      .then((result) => {
        if (!isCurrent()) return null;
        setData(result);
        setError(null);
        return result;
      })
      .catch((err: Error) => {
        if (isCurrent()) setError(err.message);
        return null;
      })
      .finally(() => {
        if (!isCurrent()) return;
        current.pending = null;
        setLoading(false);
      });
  }, [path]);

  const reload = useCallback(() => { void load(true); }, [load]);
  const refresh = useCallback(() => load(false), [load]);

  useEffect(() => {
    const current = { path, pending: null as AbortController | null };
    scope.current = current;
    if (path) reload();
    return () => {
      scope.current = null;
      current.pending?.abort();
    };
  }, [path, reload]);

  useEffect(() => {
    if (!pollMs || !path) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible' && !scope.current?.pending) void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, path, refresh]);

  return { data: path ? data : null, loading: Boolean(path) && loading, error: path ? error : null, reload, refresh };
}

export function useLazyApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pending.current?.abort();
      pending.current = null;
    };
  }, []);

  const run = useCallback(async (path: string) => {
    if (!mounted.current) return null;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    const isCurrent = () => mounted.current && !controller.signal.aborted;
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path, { signal: controller.signal });
      if (!isCurrent()) return null;
      setData(result);
      return result;
    } catch (err) {
      if (!isCurrent()) return null;
      setError((err as Error).message);
      throw err;
    } finally {
      if (isCurrent()) {
        pending.current = null;
        setLoading(false);
      }
    }
  }, []);

  return { data, loading, error, run };
}
