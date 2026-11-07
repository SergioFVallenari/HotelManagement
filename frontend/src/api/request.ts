export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export async function requestJson<T>(url: string, options: RequestOptions = {}, onUnauthorized?: () => void): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(options.signal?.reason);
  options.signal?.throwIfAborted();
  options.signal?.addEventListener('abort', abort, { once: true });
  const timeoutMs = options.timeoutMs ?? 10000;
  let timedOut = false;
  const timeout = timeoutMs > 0 ? setTimeout(() => {
    if (controller.signal.aborted) return;
    timedOut = true;
    controller.abort();
  }, timeoutMs) : undefined;

  try {
    const method = (options.method ?? 'GET').toUpperCase();
    const headers: Record<string, string> = options.body !== undefined ? { 'Content-Type': 'application/json' } : {};
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) headers['X-GH-CSRF'] = '1';
    const response = await fetch(url, {
      method,
      credentials: 'include',
      // Un Content-Type en GET dispara un preflight innecesario.
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    controller.signal.throwIfAborted();
    const json = text ? JSON.parse(text) : null;

    if (!response.ok) {
      if (response.status === 401) onUnauthorized?.();
      throw new ApiError(json?.error?.message ?? `Error ${response.status}`, response.status, json?.error?.code, json?.error?.details);
    }
    return json as T;
  } catch (err) {
    if (timedOut) {
      throw new ApiError('El servidor tardó demasiado en responder. Probá de nuevo.', 408, 'TIMEOUT');
    }
    controller.signal.throwIfAborted();
    throw err;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
}
