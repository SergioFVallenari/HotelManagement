import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectBillingPayment } from '../src/modules/billing/providers/billingPaymentInspection.js';

const contract = { id: 42, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-test', amount: '150.00', currency: 'ARS' };
const payment = { id: 123, status: 'approved', status_detail: 'accredited', live_mode: false, external_reference: 'LAIXIA-CONTRACT-42', transaction_amount: 150, currency_id: 'ARS' };
const subscription = { id: 'sub-test', status: 'authorized', external_reference: 'LAIXIA-CONTRACT-42', payer_email: 'privado@example.test', auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 150, currency_id: 'ARS' } };

test('identifica el contrato desde un pago de prueba sin conceder acceso ni devolver datos personales', async () => {
  const reads: string[] = [];
  const result = await inspectBillingPayment('123', {
    read: async (resource, id) => { reads.push(`${resource}:${id}`); return resource === 'payment' ? payment : subscription; },
    findContract: async (id) => { assert.equal(id, 42); return contract; },
  });
  assert.deepEqual(reads, ['payment:123', 'subscription:sub-test']);
  assert.deepEqual(result, { result: 'REVIEW', reason: 'INSTALLMENT_REQUIRED', contractId: 42, providerSubscriptionId: 'sub-test' });
  assert.ok(!JSON.stringify(result).includes(subscription.payer_email));
});

test('no consulta identificadores de actividad ni otros IDs inválidos como si fueran pagos', async () => {
  for (const id of ['', 'subscriptions-abc', 'https://example.test/123', '0', '-1', '01', '1'.repeat(201)]) {
    assert.deepEqual(await inspectBillingPayment(id, {
      read: async () => { throw new Error('No debe consultar'); }, findContract: async () => { throw new Error('No debe consultar'); },
    }), { result: 'REVIEW', reason: 'INVALID_PAYMENT' });
  }
});

test('no busca contratos para pagos reales, desconocidos, rechazados o sin referencia verificable', async () => {
  const cases = [
    [null, 'INVALID_PAYMENT'],
    [{ ...payment, id: 124 }, 'INVALID_PAYMENT'],
    [{ ...payment, status: 'rejected' }, 'NOT_APPROVED'],
    [{ ...payment, status_detail: 'pending' }, 'NOT_APPROVED'],
    [{ ...payment, external_reference: null }, 'REFERENCE_UNAVAILABLE'],
    [{ ...payment, external_reference: 'LAIXIA-CONTRACT-9007199254740992' }, 'REFERENCE_UNAVAILABLE'],
  ] as const;
  for (const [value, reason] of cases) {
    assert.deepEqual(await inspectBillingPayment('123', { read: async () => value, findContract: async () => { throw new Error('No debe consultar'); } }), { result: 'REVIEW', reason });
  }
});

test('distingue modo real, campo ausente y valores inválidos sin exponerlos ni consultar contratos', async () => {
  const missingMode: Record<string, unknown> = { ...payment };
  delete missingMode.live_mode;
  const cases = [
    [{ ...payment, live_mode: true }, 'LIVE'],
    [missingMode, 'MISSING'],
    ...[null, undefined, 'false', 'true', 0, 1, { token: 'dato-sensible' }, []].map((live_mode) => [{ ...payment, live_mode }, 'INVALID'] as const),
  ] as const;
  for (const [value, mode] of cases) {
    let reads = 0;
    const result = await inspectBillingPayment('123', {
      read: async (resource, id) => { assert.equal(++reads, 1); assert.equal(resource, 'payment'); assert.equal(id, '123'); return value; },
      findContract: async () => { throw new Error('No debe consultar contratos'); },
    });
    assert.deepEqual(result, { result: 'REVIEW', reason: 'MODE_MISMATCH', mode });
    assert.ok(!JSON.stringify(result).includes('dato-sensible'));
  }
});

test('no consulta otra suscripción si el contrato o importe del pago no coinciden', async () => {
  for (const changed of [null, { ...contract, id: 43 }, { ...contract, provider: 'OTRO' }, { ...contract, currency: 'USD' }, { ...contract, providerSubscriptionId: null }, { ...contract, amount: '151.00' }]) {
    let calls = 0;
    const result = await inspectBillingPayment('123', { read: async () => { assert.equal(++calls, 1); return payment; }, findContract: async () => changed });
    assert.equal(result.reason, changed?.amount === '151.00' ? 'AMOUNT_MISMATCH' : 'CONTRACT_UNAVAILABLE');
  }
});

test('deja en revisión suscripciones ajenas, canceladas o con otras condiciones', async () => {
  for (const changed of [null, { ...subscription, id: 'other' }, { ...subscription, external_reference: 'LAIXIA-CONTRACT-43' }, { ...subscription, status: 'cancelled' }, { ...subscription, auto_recurring: null }, { ...subscription, auto_recurring: { ...subscription.auto_recurring, frequency: 12 } }, { ...subscription, auto_recurring: { ...subscription.auto_recurring, transaction_amount: 151 } }]) {
    const result = await inspectBillingPayment('123', { read: async (resource) => resource === 'payment' ? payment : changed, findContract: async () => contract });
    assert.deepEqual(result, { result: 'REVIEW', reason: 'SUBSCRIPTION_MISMATCH' });
  }
});

test('un fallo del proveedor interrumpe el diagnóstico sin concluir que no existe el pago', async () => {
  await assert.rejects(inspectBillingPayment('123', { read: async () => { throw new Error('Proveedor no disponible'); }, findContract: async () => contract }), /Proveedor no disponible/);
});
