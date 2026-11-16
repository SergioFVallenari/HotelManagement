import type { CreateBillingSubscriptionInput } from './billingProvider.js';
import { buildMercadoPagoPendingSubscription, parseMercadoPagoCheckoutResponse } from './mercadoPagoCheckout.js';

export class BillingProviderOutcomeUnknown extends Error {
  constructor() {
    super('No se pudo confirmar si Mercado Pago creó la suscripción. Es necesario conciliar antes de reintentar.');
    this.name = 'BillingProviderOutcomeUnknown';
  }
}

export interface MercadoPagoTestClientOptions {
  enabled: boolean;
  environment: 'development' | 'testing' | 'production';
  accessToken: string;
  transport: typeof fetch;
}

export async function createMercadoPagoPendingSubscription(
  input: CreateBillingSubscriptionInput,
  options: MercadoPagoTestClientOptions,
): Promise<{ externalId: string; authorizationUrl: string; status: 'pending' }> {
  if (!options.enabled || options.environment !== 'testing' || !options.accessToken.trim()) {
    throw new Error('El checkout de prueba no está habilitado o no está configurado');
  }
  const body = buildMercadoPagoPendingSubscription(input);
  let response: Response;
  try {
    response = await options.transport('https://api.mercadopago.com/preapproval', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
  } catch {
    throw new BillingProviderOutcomeUnknown();
  }
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 429) throw new BillingProviderOutcomeUnknown();
    throw new Error(`Mercado Pago rechazó la solicitud de suscripción (${response.status})`);
  }
  let payload: unknown;
  try { payload = await response.json(); } catch { throw new BillingProviderOutcomeUnknown(); }
  try { return parseMercadoPagoCheckoutResponse(payload); } catch { throw new BillingProviderOutcomeUnknown(); }
}
