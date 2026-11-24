import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubscriptionSyncArgs, syncTestSubscription } from '../src/modules/billing/providers/billingSubscriptionSync.js';
import type { SubscriptionContract } from '../src/modules/billing/providers/billingSubscription.js';

const config = { environment: 'testing', enabled: true, databaseUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo:simulado@aws-1-us-west-2.pooler.supabase.com:6543/postgres' };
const now = new Date('2026-11-23T12:00:00Z');
const contract: SubscriptionContract = { id: 12, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-123', status: 'PENDING', amount: '150.00', currency: 'ARS', intervalMonths: 1, providerUpdatedAt: null };
const subscription = { id: 'sub-123', status: 'authorized', external_reference: 'LAIXIA-CONTRACT-12', collector_id: 10, last_modified: '2026-11-17T02:25:56.768Z', auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: 150, currency_id: 'ARS' } };

function dependencies() {
  return {
    config, now,
    findContract: async () => contract,
    readSubscription: async () => subscription,
    readIdentity: async () => ({ id: 10 }),
    record: async () => { throw new Error('No debe escribir'); },
  };
}

test('el parser exige un contrato válido y solo admite --apply como segundo argumento', () => {
  assert.deepEqual(parseSubscriptionSyncArgs(['12']), { contractId: 12, apply: false });
  assert.deepEqual(parseSubscriptionSyncArgs(['12', '--apply']), { contractId: 12, apply: true });
  for (const args of [[], ['0'], ['-1'], ['1.5'], ['01'], ['12', '--force'], ['--apply', '12'], ['12', '--apply', 'extra'], ['9007199254740992']]) assert.throws(() => parseSubscriptionSyncArgs(args));
});

test('simula sin persistencia y vincula el recurso del proveedor al contrato solicitado', async () => {
  const reads: string[] = [];
  const result = await syncTestSubscription({ contractId: 12, apply: false }, {
    ...dependencies(),
    findContract: async (id) => { reads.push(`contract:${id}`); return contract; },
    readSubscription: async (id) => { reads.push(`subscription:${id}`); return subscription; },
    readIdentity: async () => { reads.push('identity:me'); return { id: 10, email: 'privado@example.test' }; },
  });
  assert.deepEqual(reads, ['contract:12', 'subscription:sub-123', 'identity:me']);
  assert.deepEqual(result, { result: 'VERIFIED_NOT_APPLIED', contractId: 12, localStatus: 'PENDING', providerStatus: 'AUTHORIZED', providerUpdatedAt: new Date(subscription.last_modified), transition: 'UPDATE' });
  assert.ok(!JSON.stringify(result).includes('privado'));
});

test('aplicar vuelve a consultar el proveedor y devuelve el resultado transaccional, no el de una simulación previa', async () => {
  let reads = 0;
  let records = 0;
  for (const status of ['UPDATED', 'UNCHANGED', 'STALE'] as const) {
    const result = await syncTestSubscription({ contractId: 12, apply: true }, {
      ...dependencies(),
      readSubscription: async () => { reads++; return subscription; },
      record: async (verified) => {
        records++;
        assert.equal(verified.contractId, 12);
        assert.equal(verified.status, 'AUTHORIZED');
        return { result: status, status: 'AUTHORIZED', providerUpdatedAt: verified.providerUpdatedAt };
      },
    });
    assert.equal(result.result, status);
  }
  assert.equal(reads, 3);
  assert.equal(records, 3);
});

test('un contrato inexistente, distinto o sin recurso no consulta al proveedor', async () => {
  for (const value of [null, { ...contract, id: 13 }, { ...contract, providerSubscriptionId: null }]) {
    assert.deepEqual(await syncTestSubscription({ contractId: 12, apply: true }, {
      ...dependencies(), findContract: async () => value,
      readSubscription: async () => { throw new Error('No debe consultar'); },
    }), { result: 'REVIEW', reason: 'CONTRACT_UNAVAILABLE' });
  }
});

test('no aplica referencias cruzadas, montos incorrectos, vendedores ajenos o fechas inválidas', async () => {
  for (const value of [
    { ...subscription, external_reference: 'LAIXIA-CONTRACT-13' },
    { ...subscription, collector_id: 11 }, { ...subscription, last_modified: null },
    { ...subscription, auto_recurring: { ...subscription.auto_recurring, transaction_amount: 151 } },
  ]) assert.equal((await syncTestSubscription({ contractId: 12, apply: true }, { ...dependencies(), readSubscription: async () => value })).result, 'REVIEW');
});

test('la vista previa refleja versiones repetidas o antiguas y rechaza reactivar cancelaciones', async () => {
  const providerUpdatedAt = new Date(subscription.last_modified);
  for (const [local, transition] of [
    [{ ...contract, status: 'AUTHORIZED' as const, providerUpdatedAt }, 'UNCHANGED'],
    [{ ...contract, status: 'PAUSED' as const, providerUpdatedAt: now }, 'STALE'],
  ] as const) {
    const result = await syncTestSubscription({ contractId: 12, apply: false }, { ...dependencies(), findContract: async () => local });
    assert.equal(result.result, 'VERIFIED_NOT_APPLIED');
    assert.ok('transition' in result && result.transition === transition);
  }
  assert.deepEqual(await syncTestSubscription({ contractId: 12, apply: true }, { ...dependencies(), findContract: async () => ({ ...contract, status: 'CANCELED' }) }), { result: 'REVIEW', reason: 'INVALID_TRANSITION' });
});

test('exige testing y la base verificada antes de consultar', async () => {
  for (const value of [
    { ...config, environment: 'production' }, { ...config, enabled: false },
    { ...config, databaseUrl: 'inválida' },
    { ...config, databaseUrl: config.databaseUrl.replace('sowbuvdeampxsbpgtgvo', 'otro') },
    { ...config, databaseUrl: config.databaseUrl.replace('.pooler.supabase.com', '.example.test') },
    { ...config, databaseUrl: config.databaseUrl.replace('postgresql:', 'https:') },
  ]) await assert.rejects(syncTestSubscription({ contractId: 12, apply: true }, { ...dependencies(), config: value, findContract: async () => { assert.fail('No debe consultar'); } }));
});

test('propaga fallos de red y conflictos de persistencia sin informar una sincronización exitosa', async () => {
  await assert.rejects(syncTestSubscription({ contractId: 12, apply: true }, { ...dependencies(), readSubscription: async () => { throw new Error('Proveedor no disponible'); } }), /Proveedor no disponible/);
  await assert.rejects(syncTestSubscription({ contractId: 12, apply: true }, { ...dependencies(), record: async () => { throw new Error('Conflicto transaccional'); } }), /Conflicto transaccional/);
});
