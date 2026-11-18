import type { MercadoPagoTestClientOptions } from './mercadoPagoClient.js';

export async function readMercadoPagoBillingIdentity(id: string, options: MercadoPagoTestClientOptions): Promise<unknown> {
  if (!options.enabled || options.environment !== 'testing' || !options.accessToken.trim()) throw new Error('La consulta de prueba no está habilitada.');
  if (id !== 'me' && !/^[1-9]\d{0,199}$/.test(id)) throw new Error('El identificador de cuenta no es válido.');
  let response: Response;
  try {
    response = await options.transport(`https://api.mercadopago.com/users/${id}`, {
      method: 'GET', headers: { Authorization: `Bearer ${options.accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000), redirect: 'error',
    });
  } catch {
    throw new Error('No se pudo consultar la identidad de Mercado Pago.');
  }
  if (!response.ok) throw new Error('Mercado Pago no pudo proporcionar la identidad.');
  try { return await response.json() as unknown; } catch { throw new Error('La respuesta de identidad no es válida.'); }
}
