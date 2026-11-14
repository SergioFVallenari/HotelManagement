import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMercadoPagoPendingSubscription, parseMercadoPagoCheckoutResponse } from '../src/modules/billing/providers/mercadoPagoCheckout.js';
import type { CreateBillingSubscriptionInput } from '../src/modules/billing/providers/billingProvider.js';

const input: CreateBillingSubscriptionInput = {
  accountId: 1, contractId: 12, payerEmail: 'owner@example.test', amount: '15000.50', currency: 'ARS',
  returnUrl: 'https://laixia.example.test/settings?tab=suscripcion', idempotencyKey: 'test-key',
};

test('prepara una suscripción mensual pendiente para el contrato guardado', () => {
  assert.deepEqual(buildMercadoPagoPendingSubscription(input), {
    reason: 'Suscripción LAIXIA', external_reference: 'LAIXIA-CONTRACT-12', payer_email: 'owner@example.test',
    auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 15000.5, currency_id: 'ARS' },
    back_url: input.returnUrl, status: 'pending',
  });
});

test('rechaza montos, identidades y retorno no seguros', () => {
  for (const amount of ['0', '-1', '1.001', '1e3', '99999999999', 'NaN']) assert.throws(() => buildMercadoPagoPendingSubscription({ ...input, amount }));
  assert.throws(() => buildMercadoPagoPendingSubscription({ ...input, contractId: 0 }));
  assert.throws(() => buildMercadoPagoPendingSubscription({ ...input, payerEmail: 'invalid' }));
  assert.throws(() => buildMercadoPagoPendingSubscription({ ...input, returnUrl: 'http://example.test' }));
});

test('acepta solo enlace HTTPS de Mercado Pago con estado pendiente', () => {
  const response = { id: 'abc123', status: 'pending', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=abc123' };
  assert.equal(parseMercadoPagoCheckoutResponse(response).externalId, 'abc123');
  assert.throws(() => parseMercadoPagoCheckoutResponse({ ...response, status: 'authorized' }));
  assert.throws(() => parseMercadoPagoCheckoutResponse({ ...response, init_point: 'https://mercadopago.com.ar.evil.test/' }));
  assert.throws(() => parseMercadoPagoCheckoutResponse({ ...response, init_point: 'http://www.mercadopago.com.ar/' }));
  assert.throws(() => parseMercadoPagoCheckoutResponse({ ...response, id: '../x' }));
});
