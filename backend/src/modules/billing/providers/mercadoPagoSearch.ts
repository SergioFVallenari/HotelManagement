import type { MercadoPagoTestClientOptions } from './mercadoPagoClient.js';

export async function inspectMercadoPagoSubscriptions(options: MercadoPagoTestClientOptions): Promise<{ candidates: unknown[]; complete: boolean }> {
  if (!options.enabled || options.environment !== 'testing' || !options.accessToken.trim()) throw new Error('La consulta de prueba no está habilitada');
  const candidates: unknown[] = [];
  const seen = new Set<string>();
  let total: number | null = null;
  let offset = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    const page = await readPage(options, offset);
    if (total !== null && page.total !== total) return { candidates, complete: false };
    total = page.total;
    for (const candidate of page.results) {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return { candidates, complete: false };
      const id = (candidate as Record<string, unknown>).id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(id) || seen.has(id)) return { candidates, complete: false };
      seen.add(id);
      candidates.push(candidate);
    }
    if (candidates.length === total) return { candidates, complete: true };
    if (!page.results.length) return { candidates, complete: false };
    offset += page.results.length;
  }
  return { candidates, complete: false };
}

async function readPage(options: MercadoPagoTestClientOptions, offset: number): Promise<{ results: unknown[]; total: number }> {
  let response: Response;
  try {
    response = await options.transport(`https://api.mercadopago.com/preapproval/search?limit=100&offset=${offset}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
  } catch {
    throw new Error('No se pudo consultar Mercado Pago');
  }
  if (!response.ok) throw new Error(`Mercado Pago no pudo proporcionar las suscripciones (${response.status})`);
  let body: unknown;
  try { body = await response.json(); } catch { throw new Error('La respuesta de Mercado Pago no es válida'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('La respuesta de Mercado Pago no es válida');
  const { paging, results } = body as Record<string, unknown>;
  if (!paging || typeof paging !== 'object' || Array.isArray(paging) || !Array.isArray(results)) throw new Error('La respuesta de Mercado Pago no es válida');
  const page = paging as Record<string, unknown>;
  const validInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  if (!validInteger(page.offset) || !validInteger(page.limit) || page.limit === 0 || page.limit > 100 || !validInteger(page.total) || page.offset !== offset || results.length > page.limit || offset + results.length > page.total) {
    throw new Error('La paginación de Mercado Pago no es válida');
  }
  return { results, total: page.total };
}
