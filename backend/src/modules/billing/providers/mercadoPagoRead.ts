import type { MercadoPagoTestClientOptions } from './mercadoPagoClient.js';

export type BillingReadResource = 'subscription' | 'authorizedPayment' | 'payment';

export async function readMercadoPagoBillingResource(
  resource: BillingReadResource,
  id: string,
  options: MercadoPagoTestClientOptions,
): Promise<unknown> {
  if (!options.enabled || options.environment !== 'testing' || !options.accessToken.trim()) throw new Error('La consulta de prueba no está habilitada');
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) throw new Error('El identificador del proveedor no es válido');
  if ((resource === 'payment' || resource === 'authorizedPayment') && !/^\d+$/.test(id)) throw new Error('El identificador del pago no es válido');
  const path = resource === 'subscription' ? `/preapproval/${id}` : resource === 'authorizedPayment' ? `/authorized_payments/${id}` : `/v1/payments/${id}`;
  let response: Response;
  try {
    response = await options.transport(`https://api.mercadopago.com${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${options.accessToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
  } catch {
    throw new Error('No se pudo consultar Mercado Pago');
  }
  if (!response.ok) throw new Error(`Mercado Pago no pudo proporcionar el recurso (${response.status})`);
  try { return await response.json() as unknown; } catch { throw new Error('La respuesta de Mercado Pago no es válida'); }
}
