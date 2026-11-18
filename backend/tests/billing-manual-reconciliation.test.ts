import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestReconciliationEnvironment, parseTestReconciliationArgs, reconcileDeclaredTestPayment } from '../src/modules/billing/providers/billingReconciliation.js';
import { verifyAuthorizedBillingPayment } from '../src/modules/billing/providers/billingVerification.js';

const config = { environment: 'testing', enabled: true, databaseUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo:simulado@aws-0-sa-east-1.pooler.supabase.com:6543/postgres', paidAccessEnabled: false };
const input = parseTestReconciliationArgs(['42', '12', '34', '10', '20']);
const authorized = { id: 12, preapproval_id: 'sub-1', external_reference: 'LAIXIA-CONTRACT-42', status: 'processed', debit_date: '2026-11-17T02:25:53Z', transaction_amount: '150.00', currency_id: 'ARS', payment: { id: 34, status: 'approved' } };
const payment = { id: 34, collector_id: 10, payer: { id: 20 }, status: 'approved', status_detail: 'accredited', transaction_amount: 150, currency_id: 'ARS', live_mode: true, date_approved: '2026-11-17T02:26:00Z' };
const contract = { id: 42, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-1', status: 'PENDING' as const, amount: '150.00', currency: 'ARS', intervalMonths: 1 };

function dependencies() {
  return {
    config,
    read: async (resource: string) => resource === 'authorizedPayment' ? authorized : payment,
    readIdentity: async () => ({ id: 10 }),
    findContract: async () => contract,
    record: async () => { throw new Error('No debe escribir'); },
  };
}

test('la conciliación es simulación por defecto y no llama a persistencia', async () => {
  const reads: string[] = [];
  const result = await reconcileDeclaredTestPayment(input, {
    ...dependencies(),
    read: async (resource, id) => { reads.push(`${resource}:${id}`); return resource === 'authorizedPayment' ? authorized : payment; },
    readIdentity: async (id) => { reads.push(`user:${id}`); return { id: 10 }; },
  });
  assert.deepEqual(reads, ['authorizedPayment:12', 'payment:34', 'user:me']);
  assert.equal(result.result, 'VERIFIED_NOT_APPLIED');
  if (result.result !== 'VERIFIED_NOT_APPLIED') assert.fail('No se verificó la simulación');
  assert.equal(result.contractId, 42);
  assert.equal(result.amount, '150.00');
  assert.equal(result.paidAt.toISOString(), payment.date_approved.replace('Z', '.000Z'));
  assert.equal(result.testIdentitySource, 'OPERATOR_DECLARATION');
});

test('solo --apply llama a persistencia después de reconsultar cuota, pago e identidad', async () => {
  let records = 0;
  const startsAt = new Date(payment.date_approved);
  const endsAt = new Date('2026-12-17T02:26:00Z');
  for (const status of ['RECORDED', 'ALREADY_RECORDED'] as const) {
    const result = await reconcileDeclaredTestPayment({ ...input, apply: true }, {
      ...dependencies(),
      record: async (verified) => {
        records++;
        assert.equal(verified.contractId, input.contractId);
        assert.equal(verified.paymentId, input.paymentId);
        assert.equal(verified.installmentId, input.installmentId);
        return { result: status, startsAt, endsAt };
      },
    });
    assert.equal(result.result, status);
  }
  assert.equal(records, 2);
});

test('rechaza contrato, cuota, pago, cuenta, importe, moneda y fechas inconsistentes sin escribir', async () => {
  for (const changed of [
    { ...input, contractId: 43 }, { ...input, paymentId: '35' }, { ...input, installmentId: '13' },
    { ...input, declared: { sellerId: '11', buyerId: '20' } }, { ...input, declared: { sellerId: '10', buyerId: '21' } },
  ]) {
    assert.equal((await reconcileDeclaredTestPayment({ ...changed, apply: true }, dependencies())).result, 'REVIEW');
  }
  for (const changed of [
    { ...payment, transaction_amount: 151 }, { ...payment, currency_id: 'USD' }, { ...payment, date_approved: undefined },
    { ...payment, status: 'refunded' }, { ...payment, live_mode: null }, { ...payment, live_mode: 'true' },
  ]) {
    assert.equal((await reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? authorized : changed })).result, 'REVIEW');
  }
  for (const changed of [{ ...authorized, debit_date: 'inválida' }, { ...authorized, external_reference: 'LAIXIA-CONTRACT-43' }, { ...authorized, status: 'scheduled' }]) {
    assert.equal((await reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? changed : payment })).result, 'REVIEW');
  }
  for (const changed of [{ ...contract, intervalMonths: 12 }, { ...contract, status: 'CANCELED' as const }]) {
    assert.equal((await reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), findContract: async () => changed })).result, 'REVIEW');
  }
});

test('rechaza identidades ajenas y fallos del proveedor antes de escribir', async () => {
  assert.equal((await reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), readIdentity: async () => ({ id: 11 }) })).result, 'REVIEW');
  assert.equal((await reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), readIdentity: async () => { throw new Error('secreto'); } })).result, 'REVIEW');
  await assert.rejects(reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), read: async () => { throw new Error('sin conexión'); } }), /sin conexión/);
});

test('la verificación utilizada por el webhook sigue rechazando LIVE aunque las cuentas coincidan', async () => {
  assert.deepEqual(await verifyAuthorizedBillingPayment('12', dependencies()), { result: 'REVIEW', reason: 'MODE_MISMATCH' });
});

test('bloquea otros entornos y bases antes de consultar y no aplica con acceso pago activo', async () => {
  for (const changed of [
    { ...config, environment: 'production' }, { ...config, enabled: false },
    { ...config, databaseUrl: 'postgresql://postgres.otro@aws-0-sa-east-1.pooler.supabase.com/postgres' },
    { ...config, databaseUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo@host.example.test/postgres' },
    { ...config, databaseUrl: 'inválida' }, { ...config, paidAccessEnabled: true },
  ]) {
    await assert.rejects(reconcileDeclaredTestPayment({ ...input, apply: true }, { ...dependencies(), config: changed, read: async () => { assert.fail('No debe consultar'); } }));
  }
  assert.doesNotThrow(() => assertTestReconciliationEnvironment({ ...config, paidAccessEnabled: true }, false));
});

test('exige todos los IDs y solo permite --apply al final', () => {
  assert.equal(input.apply, false);
  assert.equal(parseTestReconciliationArgs(['42', '12', '34', '10', '20', '--apply']).apply, true);
  for (const args of [[], ['42', '12', '34', '10'], ['42', '12', '34', '10', '20', '--force'], ['--apply', '42', '12', '34', '10', '20'], ['0', '12', '34', '10', '20'], ['9007199254740992', '12', '34', '10', '20'], ['42', '../12', '34', '10', '20'], ['42', '12', '34', '10', '10']]) {
    assert.throws(() => parseTestReconciliationArgs(args));
  }
});
