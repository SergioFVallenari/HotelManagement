import { ApiError, requestJson, type RequestOptions } from './request';

export { ApiError } from './request';

const URL_BACKEND = import.meta.env.VITE_URL_BACKEND;

// Sirve para validar que los postMessage del popup de MercadoPago vengan
// del backend y no de cualquier pagina. Vacio en dev = no se filtra.
export const BACKEND_ORIGIN = (() => {
  try {
    return new URL(URL_BACKEND).origin;
  } catch {
    return '';
  }
})();

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  options.signal?.throwIfAborted();
  if (import.meta.env.MODE === 'demo') {
    const { handleDemoRequest, DemoApiError } = await import('../demo/api');
    options.signal?.throwIfAborted();
    try {
      return handleDemoRequest<T>(path, options);
    } catch (err) {
      if (err instanceof DemoApiError) throw new ApiError(err.message, err.status, err.code);
      throw err;
    }
  }
  return requestJson<T>(`${URL_BACKEND}/api${path}`, options, () => {
    window.dispatchEvent(new Event('auth:expired'));
  });
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
