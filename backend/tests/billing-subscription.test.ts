import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionTransition, verifyBillingSubscription, type SubscriptionContract, type VerifiedSubscription } from '../src/modules/billing/providers/billingSubscription.js';

const now = new Date('2026-11-23T12:00:00Z');
const contract: SubscriptionContract = { id: 12, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-123', status: 'PENDING', amount: '150.00', currency: 'ARS', intervalMonths: 1, providerUpdatedAt: null };
const subscription = { id: 'sub-123', external_reference: 'LAIXIA-CONTRACT-12', status: 'authorized', collector_id: 10, last_modified: '2026-11-23T11:00:00Z', auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 150, currency_id: 'ARS' } };
const verified: VerifiedSubscription = { contractId: 12, providerSubscriptionId: 'sub-123', status: 'AUTHORIZED', amount: '150.00', currency: 'ARS', providerUpdatedAt: new Date(subscription.last_modified) };

function dependencies() {
  return { now, findContract: async () => contract, readSubscription: async () => subscription, readIdentity: async () => ({ id: 10 }) };
}

test('verifica referencia, contrato, condiciones y vendedor consultando el estado canónico del proveedor', async () => {
  const calls: string[] = [];
  const result = await verifyBillingSubscription('sub-123', {
    ...dependencies(),
    findContract: async (id) => { calls.push(`contract:${id}`); return contract; },
    readSubscription: async (id) => { calls.push(`subscription:${id}`); return subscription; },
    readIdentity: async () => { calls.push('identity:me'); return { id: '10', email: 'privado@example.test' }; },
  });
  assert.deepEqual(calls, ['contract:sub-123', 'subscription:sub-123', 'identity:me']);
  assert.deepEqual(result, { result: 'VERIFIED', subscription: verified });
  assert.ok(!JSON.stringify(result).includes('privado'));
  assert.ok(!('payment' in result));
});

test('mapea estados del proveedor sin inventar pagos, períodos o acceso', async () => {
  for (const [status, expected] of [['pending', 'PENDING'], ['authorized', 'AUTHORIZED'], ['paused', 'PAUSED'], ['cancelled', 'CANCELED']] as const) {
    const result = await verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => ({ ...subscription, status }) });
    assert.equal(result.result, 'VERIFIED');
    if (result.result !== 'VERIFIED') assert.fail('Debe verificar');
    assert.equal(result.subscription.status, expected);
  }
});

test('eventos simulados o ajenos sin contrato no consultan al proveedor ni se consideran procesados', async () => {
  const result = await verifyBillingSubscription('123456', {
    ...dependencies(), findContract: async () => null,
    readSubscription: async () => { throw new Error('No debe consultar'); },
    readIdentity: async () => { throw new Error('No debe consultar'); },
  });
  assert.deepEqual(result, { result: 'REVIEW', reason: 'CONTRACT_UNAVAILABLE' });
  for (const resourceId of ['', '../id', 'x'.repeat(201)]) {
    assert.deepEqual(await verifyBillingSubscription(resourceId, { ...dependencies(), findContract: async () => { throw new Error('No debe consultar'); } }), { result: 'REVIEW', reason: 'SUBSCRIPTION_MISMATCH' });
  }
});

test('rechaza contratos con otro proveedor, recurso, moneda o periodicidad', async () => {
  for (const changed of [{ ...contract, provider: 'OTRO' }, { ...contract, providerSubscriptionId: 'sub-other' }, { ...contract, intervalMonths: 12 }, { ...contract, id: 0 }]) {
    assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), findContract: async () => changed, readSubscription: async () => { throw new Error('No debe consultar'); } }), { result: 'REVIEW', reason: 'CONTRACT_UNAVAILABLE' });
  }
  assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), findContract: async () => ({ ...contract, currency: 'USD' }) }), { result: 'REVIEW', reason: 'AMOUNT_MISMATCH' });
});

test('rechaza referencias cruzadas, estados desconocidos y cambios de condiciones', async () => {
  for (const [value, reason] of [
    [null, 'SUBSCRIPTION_MISMATCH'], [{ ...subscription, id: 'sub-other' }, 'SUBSCRIPTION_MISMATCH'],
    [{ ...subscription, external_reference: 'LAIXIA-CONTRACT-13' }, 'SUBSCRIPTION_MISMATCH'],
    [{ ...subscription, status: 'unknown' }, 'UNSUPPORTED_STATUS'], [{ ...subscription, status: '__proto__' }, 'UNSUPPORTED_STATUS'],
    [{ ...subscription, auto_recurring: null }, 'AMOUNT_MISMATCH'],
    [{ ...subscription, auto_recurring: { ...subscription.auto_recurring, frequency: 12 } }, 'AMOUNT_MISMATCH'],
    [{ ...subscription, auto_recurring: { ...subscription.auto_recurring, frequency_type: 'days' } }, 'AMOUNT_MISMATCH'],
    [{ ...subscription, auto_recurring: { ...subscription.auto_recurring, currency_id: 'USD' } }, 'AMOUNT_MISMATCH'],
    [{ ...subscription, auto_recurring: { ...subscription.auto_recurring, transaction_amount: 151 } }, 'AMOUNT_MISMATCH'],
  ] as const) {
    assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => value }), { result: 'REVIEW', reason });
  }
});

test('exige timestamps con zona, válidos y no futuros fuera de tolerancia', async () => {
  for (const last_modified of [undefined, '', 'inválida', '2026-11-23T11:00:00', '2026-11-23T12:06:00Z']) {
    assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => ({ ...subscription, last_modified }) }), { result: 'REVIEW', reason: 'INVALID_TIMESTAMP' });
  }
  assert.equal((await verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => ({ ...subscription, last_modified: '2026-11-23T08:00:00-03:00' }) })).result, 'VERIFIED');
});

test('rechaza vendedores ajenos, identificadores ausentes o numéricamente inseguros', async () => {
  for (const collector_id of [null, undefined, 11, Number.MAX_SAFE_INTEGER + 1, '010']) {
    assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => ({ ...subscription, collector_id }) }), { result: 'REVIEW', reason: 'SELLER_MISMATCH' });
  }
  assert.deepEqual(await verifyBillingSubscription('sub-123', { ...dependencies(), readIdentity: async () => ({ id: 11 }) }), { result: 'REVIEW', reason: 'SELLER_MISMATCH' });
});

test('propaga caídas del proveedor para reintentar sin validar una transición', async () => {
  await assert.rejects(verifyBillingSubscription('sub-123', { ...dependencies(), readSubscription: async () => { throw new Error('fallo temporal'); } }), /fallo temporal/);
  await assert.rejects(verifyBillingSubscription('sub-123', { ...dependencies(), readIdentity: async () => { throw new Error('fallo temporal'); } }), /fallo temporal/);
});

test('las versiones repetidas son idempotentes y las antiguas no pisan el estado más nuevo', () => {
  const current = { ...contract, status: 'AUTHORIZED' as const, providerUpdatedAt: verified.providerUpdatedAt };
  assert.deepEqual(subscriptionTransition(current, verified), { result: 'UNCHANGED' });
  assert.deepEqual(subscriptionTransition(current, { ...verified, status: 'PAUSED' }), { result: 'REVIEW', reason: 'VERSION_CONFLICT' });
  assert.deepEqual(subscriptionTransition(current, { ...verified, status: 'PENDING', providerUpdatedAt: new Date('2026-11-22T10:00:00Z') }), { result: 'STALE' });
});

test('vuelve a validar contra el estado bloqueado y nunca reactiva un contrato cancelado', () => {
  assert.deepEqual(subscriptionTransition(contract, verified), { result: 'UPDATE' });
  assert.deepEqual(subscriptionTransition({ ...contract, status: 'CANCELED' }, verified), { result: 'REVIEW', reason: 'INVALID_TRANSITION' });
  assert.deepEqual(subscriptionTransition({ ...contract, status: 'AUTHORIZED' }, { ...verified, status: 'PENDING' }), { result: 'REVIEW', reason: 'INVALID_TRANSITION' });
  assert.deepEqual(subscriptionTransition({ ...contract, status: 'PAUSED' }, verified), { result: 'UPDATE' });
  assert.deepEqual(subscriptionTransition({ ...contract, status: 'CANCELED' }, { ...verified, status: 'CANCELED' }), { result: 'UPDATE' });
});
