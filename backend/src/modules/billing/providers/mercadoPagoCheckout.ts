import type { CreateBillingSubscriptionInput } from './billingProvider.js';

export interface MercadoPagoPendingSubscriptionPayload {
  reason: string;
  external_reference: string;
  payer_email: string;
  auto_recurring: { frequency: 1; frequency_type: 'months'; transaction_amount: number; currency_id: 'ARS' };
  back_url: string;
  status: 'pending';
}

export function buildMercadoPagoPendingSubscription(input: CreateBillingSubscriptionInput): MercadoPagoPendingSubscriptionPayload {
  if (!Number.isSafeInteger(input.contractId) || input.contractId <= 0 || !Number.isSafeInteger(input.accountId) || input.accountId <= 0) {
    throw new Error('El contrato de facturación no es válido');
  }
  const amount = input.amount.trim();
  if (!/^(0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error('El precio de la suscripción no es válido');
  }
  const email = input.payerEmail.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El email del titular no es válido');
  let url: URL;
  try { url = new URL(input.returnUrl); } catch { throw new Error('La URL de retorno no es válida'); }
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('La URL de retorno debe usar HTTPS');
  if (input.currency !== 'ARS') throw new Error('La moneda de la suscripción no es válida');
  return {
    reason: 'Suscripción LAIXIA',
    external_reference: `LAIXIA-CONTRACT-${input.contractId}`,
    payer_email: email,
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: Number(amount), currency_id: 'ARS' },
    back_url: url.toString(),
    status: 'pending',
  };
}

export function parseMercadoPagoCheckoutResponse(value: unknown): { externalId: string; authorizationUrl: string; status: 'pending' } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('La respuesta del proveedor no es válida');
  const response = value as Record<string, unknown>;
  if (typeof response.id !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(response.id) || response.status !== 'pending' || typeof response.init_point !== 'string') {
    throw new Error('La respuesta del proveedor no contiene una suscripción pendiente válida');
  }
  let url: URL;
  try { url = new URL(response.init_point); } catch { throw new Error('La URL del proveedor no es válida'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.hostname !== 'mercadopago.com.ar' && !url.hostname.endsWith('.mercadopago.com.ar'))) {
    throw new Error('La URL del proveedor no es válida');
  }
  return { externalId: response.id, authorizationUrl: url.toString(), status: 'pending' };
}
