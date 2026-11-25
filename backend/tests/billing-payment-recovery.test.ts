import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePaymentRecoveryArgs, recoverConfiguredTestPayment } from '../src/modules/billing/providers/billingPaymentRecovery.js';

const input = parsePaymentRecoveryArgs(['13', '12', '34']);
const config = { enabled: true, billingEnabled: true, environment: 'testing', databaseUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo:simulado@aws-1-us-west-2.pooler.supabase.com:6543/postgres', sellerId: '10', buyerId: '20' };
const authorized = { id: 12, preapproval_id: 'sub-1', external_reference: 'LAIXIA-CONTRACT-13', status: 'processed', debit_date: '2026-11-25T15:22:21Z', transaction_amount: 150, currency_id: 'ARS', payment: { id: 34, status: 'approved' } };
const payment = { id: 34, collector_id: 10, payer: { id: 20 }, live_mode: true, status: 'approved', status_detail: 'accredited', date_approved: '2026-11-25T15:22:22Z', transaction_amount: 150, currency_id: 'ARS' };
const contract = { id: 13, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-1', status: 'PENDING' as const, amount: '150.00', currency: 'ARS', intervalMonths: 1 };
function dependencies() {
  return { config, read: async (resource: string) => resource === 'authorizedPayment' ? authorized : payment, readIdentity: async () => ({ id: 10 }), findContract: async () => contract, record: async () => { throw new Error('No debe escribir'); } };
}

test('el parser exige los tres IDs y --apply explícito, sin aceptar opciones adicionales', () => {
  assert.equal(input.apply, false);
  assert.equal(parsePaymentRecoveryArgs(['13', '12', '34', '--apply']).apply, true);
  for (const args of [[], ['13'], ['13', '12'], ['13', '12', '34', '--force'], ['13', '12', '34', '--apply', 'extra'], ['0', '12', '34'], ['01', '12', '34'], ['9007199254740992', '12', '34'], ['13', '../12', '34']]) assert.throws(() => parsePaymentRecoveryArgs(args));
});

test('simula sin escribir y vuelve a consultar cuota, pago e identidad antes de aplicar', async () => {
  const calls: string[] = [];
  const deps = { ...dependencies(), read: async (resource: string, id: string) => { calls.push(`${resource}:${id}`); return resource === 'authorizedPayment' ? authorized : payment; }, readIdentity: async (id: string) => { calls.push(`user:${id}`); return { id: 10 }; } };
  assert.equal((await recoverConfiguredTestPayment(input, deps)).result, 'VERIFIED_NOT_APPLIED');
  let records = 0;
  for (const result of ['RECORDED', 'ALREADY_RECORDED'] as const) {
    const actual = await recoverConfiguredTestPayment({ ...input, apply: true }, { ...deps, record: async (verified) => {
      records++;
      assert.equal(verified.contractId, 13);
      assert.equal(verified.paymentId, '34');
      return { result, startsAt: verified.paidAt, endsAt: new Date('2026-12-25T15:22:22Z') };
    } });
    assert.equal(actual.result, result);
  }
  assert.equal(records, 2);
  assert.deepEqual(calls, Array(3).fill(['authorizedPayment:12', 'payment:34', 'user:me']).flat());
});

test('bloquea política apagada, producción y otra base antes de consultar', async () => {
  for (const value of [{ ...config, enabled: false }, { ...config, environment: 'production' }, { ...config, buyerId: '' }, { ...config, databaseUrl: config.databaseUrl.replace('sowbuvdeampxsbpgtgvo', 'otro') }]) {
    await assert.rejects(recoverConfiguredTestPayment(input, { ...dependencies(), config: value, read: async () => { assert.fail('No debe consultar'); } }));
  }
});

test('no escribe ante contrato, pago o periodicidad diferentes a los esperados', async () => {
  for (const changed of [{ ...input, contractId: 14 }, { ...input, paymentId: '35' }, { ...input, installmentId: '99' }]) assert.equal((await recoverConfiguredTestPayment({ ...changed, apply: true }, dependencies())).result, 'REVIEW');
  assert.equal((await recoverConfiguredTestPayment({ ...input, apply: true }, { ...dependencies(), findContract: async () => ({ ...contract, intervalMonths: 12 }) })).result, 'REVIEW');
});

test('conserva verificaciones de cuentas, estados, referencias, moneda, importe y fechas', async () => {
  for (const changed of [{ ...payment, collector_id: 11 }, { ...payment, payer: { id: 21 } }, { ...payment, status: 'refunded' }, { ...payment, transaction_amount: 151 }, { ...payment, currency_id: 'USD' }, { ...payment, date_approved: null }, { ...payment, live_mode: null }]) {
    assert.equal((await recoverConfiguredTestPayment({ ...input, apply: true }, { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? authorized : changed })).result, 'REVIEW');
  }
  assert.equal((await recoverConfiguredTestPayment({ ...input, apply: true }, { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? { ...authorized, external_reference: 'otro' } : payment })).result, 'REVIEW');
  assert.equal((await recoverConfiguredTestPayment({ ...input, apply: true }, { ...dependencies(), readIdentity: async () => ({ id: 11 }) })).result, 'REVIEW');
});

test('no informa éxito si falla el proveedor o la transacción', async () => {
  await assert.rejects(recoverConfiguredTestPayment(input, { ...dependencies(), read: async () => { throw new Error('Proveedor no disponible'); } }), /Proveedor no disponible/);
  await assert.rejects(recoverConfiguredTestPayment({ ...input, apply: true }, { ...dependencies(), record: async () => { throw new Error('Conflicto'); } }), /Conflicto/);
});
