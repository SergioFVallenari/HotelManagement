import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_BATCH_SIZE, BILLING_LEASE_MS, BILLING_MAX_ATTEMPTS, billingRetryAt, billingRetryWhere, runBillingRetryBatch } from '../src/modules/billing/billing.retry.js';

test('reintenta con espera creciente y se detiene después del octavo intento', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  const delays = [60, 120, 240, 480, 960, 1920, 3600];
  delays.forEach((seconds, index) => assert.equal(billingRetryAt(index + 1, now)?.getTime(), now.getTime() + seconds * 1000));
  assert.equal(billingRetryAt(BILLING_MAX_ATTEMPTS, now), null);
  assert.equal(billingRetryAt(100, now), null);
  for (const attempt of [0, -1, 1.5, NaN]) assert.throws(() => billingRetryAt(attempt, now));
  assert.throws(() => billingRetryAt(1, new Date('inválida')));
  assert.equal(now.toISOString(), '2026-11-23T12:00:00.000Z');
});

test('selecciona ambos tópicos soportados y restringe cada reclamo al procesador correcto', () => {
  const now = new Date('2026-11-23T12:00:00Z');
  assert.deepEqual(billingRetryWhere(now), {
    provider: 'MERCADOPAGO', topic: { in: ['subscription_authorized_payment', 'subscription_preapproval'] },
    status: { in: ['RECEIVED', 'FAILED'] }, attempts: { lt: 8 }, nextAttemptAt: { lte: now },
    OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
  });
  assert.equal(BILLING_LEASE_MS, 120_000);
  assert.equal(billingRetryWhere(now, 'subscription_authorized_payment').topic, 'subscription_authorized_payment');
  assert.equal(billingRetryWhere(now, 'subscription_preapproval').topic, 'subscription_preapproval');
});

test('un fallo no interrumpe el lote y las ejecuciones son secuenciales', async () => {
  const calls: number[] = [];
  let running = false;
  const result = await runBillingRetryBatch([1, 2, 3, 4], async (id) => {
    assert.equal(running, false);
    running = true;
    await Promise.resolve();
    calls.push(id);
    running = false;
    if (id === 2) throw new Error('respuesta sensible del proveedor');
    return id === 3 ? 'DEFERRED' : 'RECORDED';
  });
  assert.deepEqual(calls, [1, 2, 3, 4]);
  assert.deepEqual(result, { selected: 4, recorded: 2, deferred: 1, failed: 1 });
  assert.ok(!JSON.stringify(result).includes('sensible'));
});

test('rechaza lotes grandes, repetidos o inválidos antes de procesar', async () => {
  for (const ids of [[0], [-1], [1.5], [1, 1], Array.from({ length: BILLING_BATCH_SIZE + 1 }, (_, index) => index + 1)]) {
    await assert.rejects(runBillingRetryBatch(ids, async () => { assert.fail('No debe procesar'); }));
  }
  assert.deepEqual(await runBillingRetryBatch([], async () => { assert.fail('No debe procesar'); }), { selected: 0, recorded: 0, deferred: 0, failed: 0 });
});
