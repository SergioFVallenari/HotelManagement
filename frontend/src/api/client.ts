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

interface RequestOptions {
  method?: string;
  body?: unknown;
  // Timeout propio de la request en ms (default 10000, 0 = sin timeout).
  // Endpoints lentos como el draft de IA (Gemini + reintentos) necesitan mas
  // margen: con los 10 s fijos la request se abortaba sola.
  timeoutMs?: number;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeout = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let response: Response;
  try {
    response = await fetch(`${URL_BACKEND}/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'include',
      // El header solo va con body: mandarlo en un GET lo convierte en
      // non-simple request y el browser le agrega un preflight OPTIONS
      // (~300ms) antes de dejar salir la peticion real.
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    // El abort del timeout sequece como "signal is aborted without reason":
    // lo traducimos a un error nuestro en espanol antes de que llegue a la UI.
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiError('El servidor tardó demasiado en responder. Probá de nuevo.', 408, 'TIMEOUT');
    }
    throw err;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message = json?.error?.message ?? `Error ${response.status}`;
    if (response.status === 401) {
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new ApiError(message, response.status, json?.error?.code, json?.error?.details);
  }

  return json as T;
}

export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}