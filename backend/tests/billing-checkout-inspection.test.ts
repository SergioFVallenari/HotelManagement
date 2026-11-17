import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPendingCheckout, type PendingCheckoutForInspection } from '../src/modules/billing/providers/billingCheckoutInspection.js';
import { inspectMercadoPagoSubscriptions } from '../src/modules/billing/providers/mercadoPagoSearch.js';

const contract: PendingCheckoutForInspection = { id: 42, ownerId: 7, status: 'PENDING', provider: 'MERCADOPAGO', providerSubscriptionId: null, checkoutUrl: null, amount: '150.00', currency: 'ARS', intervalMonths: 1, payerEmail: 'owner@example.test' };
const candidate = { id: 'sub-123', status: 'pending', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=123', external_reference: 'LAIXIA-CONTRACT-42', payer_email: 'owner@example.test', auto_recurring: { transaction_amount: 150, currency_id: 'ARS', frequency: 1, frequency_type: 'months' } };

test('un candidato coherente solo queda para revisión, sin devolver URL ni modificar el contrato', async () => {
  const result = await inspectPendingCheckout(7, { findPending: async () => contract, search: async () => ({ candidates: [candidate], complete: true }) });
  assert.deepEqual(result, { result: 'REVIEW', reason: 'POSSIBLE_MATCH' });
  assert.equal(contract.providerSubscriptionId, null);
});

test('no consulta al proveedor si el contrato no es elegible o no pertenece al titular', async () => {
  for (const item of [null, { ...contract, ownerId: 8 }, { ...contract, status: 'AUTHORIZED' }, { ...contract, checkoutUrl: 'url' }, { ...contract, providerSubscriptionId: 'sub' }]) {
    assert.deepEqual(await inspectPendingCheckout(7, { findPending: async () => item, search: async () => { throw new Error('Consulta inesperada'); } }), { result: 'REVIEW', reason: 'NOT_ELIGIBLE' });
  }
});

test('una búsqueda parcial, vacía o sin email no recupera el contrato', async () => {
  for (const [candidates, complete, reason] of [[[candidate], false, 'INCOMPLETE'], [[], true, 'NOT_FOUND'], [[{ ...candidate, payer_email: undefined }], true, 'MISMATCH']] as const) {
    assert.deepEqual(await inspectPendingCheckout(7, { findPending: async () => contract, search: async () => ({ candidates: [...candidates], complete }) }), { result: 'REVIEW', reason });
  }
});

test('los contratos antiguos sin email congelado requieren revisión sin consultar al proveedor', async () => {
  const result = await inspectPendingCheckout(7, { findPending: async () => ({ ...contract, payerEmail: null }), search: async () => { throw new Error('Consulta inesperada'); } });
  assert.deepEqual(result, { result: 'REVIEW', reason: 'INCOMPLETE' });
});

test('encuentra una coincidencia en otra página sin recuperar ni activar el contrato', async () => {
  let calls = 0;
  const result = await inspectPendingCheckout(7, {
    findPending: async () => contract,
    search: () => inspectMercadoPagoSubscriptions({ enabled: true, environment: 'testing', accessToken: 'simulado', transport: async () => {
      const offset = calls++;
      const item = offset === 0 ? { ...candidate, id: 'unrelated', external_reference: 'LAIXIA-CONTRACT-99' } : candidate;
      return new Response(JSON.stringify({ paging: { offset, limit: 1, total: 2 }, results: [item] }));
    } }),
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { result: 'REVIEW', reason: 'POSSIBLE_MATCH' });
  assert.equal(contract.providerSubscriptionId, null);
  assert.equal(contract.status, 'PENDING');
});
