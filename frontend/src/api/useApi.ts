import { useCallback, useEffect, useState } from 'react';
import { api } from './client';

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
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

  useEffect(() => reload(), [reload]);

  return { data, loading, error, reload };
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