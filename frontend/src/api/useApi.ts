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
  const requestId = useRef(0);

  const reload = useCallback(() => {
    if (!path) return () => {};
    let alive = true;
    setLoading(true);
    setError(null);
    api<T>(path)
      .then((result) => alive && setData(result))
      .catch((err: Error) => alive && setError(err.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path]);

  const refresh = useCallback(async () => {
    if (!path) return null;
    const id = ++requestId.current;
    try {
      const result = await api<T>(path);
      if (id !== requestId.current) return null;
      setData(result);
      setError(null);
      return result;
    } catch (err) {
      if (id === requestId.current) setError((err as Error).message);
      return null;
    }
  }, [path]);

  useEffect(() => reload(), [reload]);

  useEffect(() => {
    if (!pollMs || !path) return;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, pollMs);
    return () => clearInterval(id);
  }, [pollMs, path, refresh]);

  return { data, loading, error, reload, refresh };
}

export function useLazyApi<T>() {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<T>(path);
      setData(result);
      return result;
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, run };
}
