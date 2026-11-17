import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BillingProviderOutcomeUnknown, BillingProviderRejected, createMercadoPagoPendingSubscription } from '../src/modules/billing/providers/mercadoPagoClient.js';
import type { CreateBillingSubscriptionInput } from '../src/modules/billing/providers/billingProvider.js';

const input: CreateBillingSubscriptionInput = {
  accountId: 1, contractId: 3, payerEmail: 'owner@example.test', amount: '150.00', currency: 'ARS',
  returnUrl: 'https://testing.example.test/settings?tab=suscripcion', idempotencyKey: 'test',
};

test('checkout de prueba envía una suscripción pendiente y valida el enlace', async () => {
  let calls = 0;
  const transport: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, 'https://api.mercadopago.com/preapproval');
    assert.equal(options?.redirect, 'error');
    assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer token-prueba');
    assert.equal(JSON.parse(options?.body as string).status, 'pending');
    return new Response(JSON.stringify({ id: 'sub-123', status: 'pending', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=123' }));
  };
  const result = await createMercadoPagoPendingSubscription(input, { enabled: true, environment: 'testing', accessToken: 'token-prueba', transport });
  assert.equal(result.externalId, 'sub-123');
  assert.equal(result.status, 'pending');
  assert.equal(calls, 1);
});

test('no hace llamadas si está apagado o fuera de testing', async () => {
  const transport: typeof fetch = async () => { throw new Error('No debe llamar'); };
  for (const options of [
    { enabled: false, environment: 'testing' as const, accessToken: 'token', transport },
    { enabled: true, environment: 'production' as const, accessToken: 'token', transport },
    { enabled: true, environment: 'testing' as const, accessToken: '', transport },
  ]) await assert.rejects(createMercadoPagoPendingSubscription(input, options), /no está habilitado/);
});

test('una respuesta ambigua nunca se reintenta automáticamente', async () => {
  let calls = 0;
  const transport: typeof fetch = async () => { calls++; throw new Error('timeout'); };
  await assert.rejects(createMercadoPagoPendingSubscription(input, { enabled: true, environment: 'testing', accessToken: 'token', transport }), BillingProviderOutcomeUnknown);
  assert.equal(calls, 1);
});

test('errores del proveedor no exponen cuerpo ni credenciales', async () => {
  const transport: typeof fetch = async () => new Response('secreto-proveedor', { status: 400 });
  await assert.rejects(createMercadoPagoPendingSubscription(input, { enabled: true, environment: 'testing', accessToken: 'token-secreto', transport }), (err: unknown) => err instanceof BillingProviderRejected && err.status === 400 && !err.message.includes('secreto'));
});

test('una respuesta exitosa ilegible o un error temporal requiere conciliación', async () => {
  for (const transport of [
    (async () => new Response('no es json', { status: 200 })) as typeof fetch,
    (async () => new Response('', { status: 503 })) as typeof fetch,
    (async () => new Response('', { status: 409 })) as typeof fetch,
  ]) await assert.rejects(createMercadoPagoPendingSubscription(input, { enabled: true, environment: 'testing', accessToken: 'token', transport }), BillingProviderOutcomeUnknown);
});
