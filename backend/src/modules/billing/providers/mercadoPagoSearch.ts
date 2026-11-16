import type { MercadoPagoTestClientOptions } from './mercadoPagoClient.js';

export async function inspectMercadoPagoSubscriptions(options: MercadoPagoTestClientOptions): Promise<{ candidates: unknown[]; singlePage: boolean }> {
  if (!options.enabled || options.environment !== 'testing' || !options.accessToken.trim()) throw new Error('La consulta de prueba no está habilitada');
  let response: Response;
  try {
    response = await options.transport('https://api.mercadopago.com/preapproval/search?limit=100&offset=0', {
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
  if (!validInteger(page.offset) || !validInteger(page.limit) || page.limit === 0 || page.limit > 100 || !validInteger(page.total) || page.offset !== 0 || results.length > page.limit || results.length > page.total) {
    throw new Error('La paginación de Mercado Pago no es válida');
  }
  return { candidates: results, singlePage: results.length === page.total };
}
