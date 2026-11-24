import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuredBillingTestAccounts } from '../src/modules/billing/providers/billingTestAccountPolicy.js';
import { verifyConfiguredTestBillingPayment } from '../src/modules/billing/providers/billingVerification.js';

const config = { enabled: true, billingEnabled: true, environment: 'testing', databaseUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo:simulado@aws-1-us-west-2.pooler.supabase.com:6543/postgres', sellerId: '10', buyerId: '20' };
const authorized = { id: 12, preapproval_id: 'sub-1', external_reference: 'LAIXIA-CONTRACT-42', status: 'processed', debit_date: '2026-11-17T12:00:00Z', transaction_amount: '150.00', currency_id: 'ARS', payment: { id: 34, status: 'approved' } };
const payment = { id: 34, collector_id: 10, payer: { id: 20 }, live_mode: true, status: 'approved', status_detail: 'accredited', date_approved: '2026-11-17T12:00:01Z', transaction_amount: 150, currency_id: 'ARS' };
const contract = { id: 42, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-1', status: 'AUTHORIZED' as const, amount: '150.00', currency: 'ARS' };

function dependencies() {
  return {
    configuredAccounts: configuredBillingTestAccounts(config),
    read: async (resource: string) => resource === 'authorizedPayment' ? authorized : payment,
    readIdentity: async () => ({ id: 10 }),
    findContract: async () => contract,
  };
}

test('la política apagada conserva la verificación estricta sin inferir IDs', async () => {
  assert.equal(configuredBillingTestAccounts({ ...config, enabled: false, databaseUrl: '', sellerId: '', buyerId: '' }), null);
  const result = await verifyConfiguredTestBillingPayment('12', { ...dependencies(), configuredAccounts: null, readIdentity: async () => { throw new Error('No debe consultar'); } });
  assert.deepEqual(result, { result: 'REVIEW', reason: 'MODE_MISMATCH' });
  assert.equal((await verifyConfiguredTestBillingPayment('12', { ...dependencies(), configuredAccounts: null, read: async (resource) => resource === 'authorizedPayment' ? authorized : { ...payment, live_mode: false } })).result, 'VERIFIED');
});

test('la política habilitada exige contexto de testing, proyecto verificado y dos IDs distintos', () => {
  assert.deepEqual(configuredBillingTestAccounts(config), { sellerId: '10', buyerId: '20' });
  for (const changed of [
    { ...config, billingEnabled: false }, { ...config, environment: 'production' }, { ...config, environment: 'development' },
    { ...config, databaseUrl: '' }, { ...config, databaseUrl: config.databaseUrl.replace('sowbuvdeampxsbpgtgvo', 'otro') },
    { ...config, databaseUrl: config.databaseUrl.replace('.pooler.supabase.com', '.example.test') },
    { ...config, databaseUrl: config.databaseUrl.replace('postgresql:', 'https:') },
    { ...config, databaseUrl: config.databaseUrl.replace(':6543', ':1234') },
    { ...config, databaseUrl: config.databaseUrl.replace('/postgres', '/otra') },
    { ...config, databaseUrl: `${config.databaseUrl}?user=otro` },
    { ...config, databaseUrl: `${config.databaseUrl}?host=otro` },
    { ...config, sellerId: '' }, { ...config, buyerId: '' }, { ...config, buyerId: '10' },
    { ...config, sellerId: '010' }, { ...config, buyerId: '../20' }, { ...config, buyerId: '2'.repeat(201) },
  ]) assert.throws(() => configuredBillingTestAccounts(changed));
});

test('verifica cuota, pago e identidad de la credencial con las cuentas configuradas', async () => {
  const calls: string[] = [];
  const result = await verifyConfiguredTestBillingPayment('12', {
    ...dependencies(),
    read: async (resource, id) => { calls.push(`${resource}:${id}`); return resource === 'authorizedPayment' ? authorized : payment; },
    readIdentity: async (id) => { calls.push(`user:${id}`); return { id: 10, email: 'privado@example.test' }; },
  });
  assert.deepEqual(calls, ['authorizedPayment:12', 'payment:34', 'user:me']);
  assert.equal(result.result, 'VERIFIED');
  assert.equal(payment.live_mode, true);
  assert.ok(!JSON.stringify(result).includes('privado'));
});

test('bloquea vendedor, comprador y credencial ajenos incluso si el pago viene con live_mode=false', async () => {
  for (const live_mode of [true, false]) {
    for (const changed of [{ ...payment, live_mode, collector_id: 11 }, { ...payment, live_mode, payer: { id: 21 } }]) {
      assert.deepEqual(await verifyConfiguredTestBillingPayment('12', { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? authorized : changed, readIdentity: async () => { throw new Error('No debe consultar'); } }), { result: 'REVIEW', reason: 'MODE_MISMATCH' });
    }
    assert.deepEqual(await verifyConfiguredTestBillingPayment('12', { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? authorized : { ...payment, live_mode }, readIdentity: async () => ({ id: 11 }) }), { result: 'REVIEW', reason: 'MODE_MISMATCH' });
  }
});

test('la excepción no acepta modos ausentes, valores inválidos, pagos rechazados ni importes distintos', async () => {
  for (const [changed, reason] of [
    [{ ...payment, live_mode: undefined }, 'MODE_MISMATCH'], [{ ...payment, live_mode: 'true' }, 'MODE_MISMATCH'],
    [{ ...payment, status: 'refunded' }, 'NOT_APPROVED'], [{ ...payment, transaction_amount: 151 }, 'AMOUNT_MISMATCH'],
    [{ ...payment, currency_id: 'USD' }, 'AMOUNT_MISMATCH'], [{ ...payment, date_approved: null }, 'INCOMPLETE'],
  ] as const) {
    assert.deepEqual(await verifyConfiguredTestBillingPayment('12', { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? authorized : changed }), { result: 'REVIEW', reason });
  }
});

test('conserva las validaciones del contrato y de referencia de la cuota', async () => {
  assert.deepEqual(await verifyConfiguredTestBillingPayment('12', { ...dependencies(), findContract: async () => ({ ...contract, status: 'CANCELED' }) }), { result: 'REVIEW', reason: 'CONTRACT_NOT_ELIGIBLE' });
  assert.deepEqual(await verifyConfiguredTestBillingPayment('12', { ...dependencies(), read: async (resource) => resource === 'authorizedPayment' ? { ...authorized, external_reference: 'LAIXIA-CONTRACT-43' } : payment }), { result: 'REVIEW', reason: 'CONTRACT_MISMATCH' });
});
