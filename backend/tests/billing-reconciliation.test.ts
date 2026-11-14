import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcilePendingCheckout } from '../src/modules/billing/providers/mercadoPagoReconciliation.js';

const candidate = {
  id: 'sub-123', status: 'pending', init_point: 'https://www.mercadopago.com.ar/subscriptions/checkout?id=123',
  external_reference: 'LAIXIA-CONTRACT-42', payer_email: 'owner@example.test',
  auto_recurring: { transaction_amount: 150, currency_id: 'ARS', frequency: 1, frequency_type: 'months' },
};
const input = { contractId: 42, expectedEmail: 'owner@example.test', expectedAmount: '150.00', candidates: [candidate], complete: true };

test('recupera una sola suscripción pendiente con referencia y condiciones idénticas', () => {
  assert.deepEqual(reconcilePendingCheckout(input), { result: 'RECOVERED', externalId: 'sub-123', checkoutUrl: candidate.init_point });
});

test('no autoriza un nuevo intento si la búsqueda es incompleta, vacía o duplicada', () => {
  assert.deepEqual(reconcilePendingCheckout({ ...input, complete: false }), { result: 'REVIEW', reason: 'INCOMPLETE' });
  assert.deepEqual(reconcilePendingCheckout({ ...input, candidates: [] }), { result: 'REVIEW', reason: 'NOT_FOUND' });
  assert.deepEqual(reconcilePendingCheckout({ ...input, candidates: [candidate, candidate] }), { result: 'REVIEW', reason: 'MULTIPLE' });
});

test('rechaza pagos, frecuencia o titular que no coinciden', () => {
  for (const changed of [
    { ...candidate, payer_email: 'otro@example.test' },
    { ...candidate, auto_recurring: { ...candidate.auto_recurring, transaction_amount: 151 } },
    { ...candidate, auto_recurring: { ...candidate.auto_recurring, currency_id: 'USD' } },
    { ...candidate, auto_recurring: { ...candidate.auto_recurring, frequency: 12 } },
    { ...candidate, status: 'authorized' },
  ]) assert.deepEqual(reconcilePendingCheckout({ ...input, candidates: [changed] }), { result: 'REVIEW', reason: 'MISMATCH' });
});
