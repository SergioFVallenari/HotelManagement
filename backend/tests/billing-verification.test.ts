import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuthorizedBillingPayment, type BillingContractForVerification } from '../src/modules/billing/providers/billingVerification.js';

const authorized = { id: 12, preapproval_id: 'sub-1', external_reference: 'LAIXIA-CONTRACT-42', status: 'processed', debit_date: '2026-11-14T12:00:00Z', transaction_amount: '150.00', currency_id: 'ARS', payment: { id: 34, status: 'approved' } };
const payment = { id: 34, status: 'approved', status_detail: 'accredited', transaction_amount: 150, currency_id: 'ARS', live_mode: false, date_approved: '2026-11-14T12:00:00.000Z' };
const contract: BillingContractForVerification = { id: 42, provider: 'MERCADOPAGO', providerSubscriptionId: 'sub-1', status: 'PENDING', amount: '150.00', currency: 'ARS' };

test('verifica contrato y pago con dos consultas al proveedor', async () => {
  const calls: string[] = [];
  const result = await verifyAuthorizedBillingPayment('12', {
    read: async (resource, id) => { calls.push(`${resource}:${id}`); return resource === 'authorizedPayment' ? authorized : payment; },
    findContract: async (id) => { assert.equal(id, 'sub-1'); return contract; },
  });
  assert.deepEqual(calls, ['authorizedPayment:12', 'payment:34']);
  assert.deepEqual(result, { result: 'VERIFIED', contractId: 42, providerSubscriptionId: 'sub-1', installmentId: '12', scheduledAt: new Date('2026-11-14T12:00:00Z'), paymentId: '34', paidAt: new Date('2026-11-14T12:00:00Z'), amount: '150.00', currency: 'ARS' });
});

test('no consulta el pago si no encuentra un contrato elegible', async () => {
  const calls: string[] = [];
  const result = await verifyAuthorizedBillingPayment('12', {
    read: async (resource) => { calls.push(resource); return authorized; },
    findContract: async () => ({ ...contract, status: 'CANCELED' }),
  });
  assert.deepEqual(result, { result: 'REVIEW', reason: 'CONTRACT_NOT_ELIGIBLE' });
  assert.deepEqual(calls, ['authorizedPayment']);
});

test('rechaza datos inconsistentes y propaga caídas del proveedor para reintento', async () => {
  const dependencies = { read: async (resource: 'authorizedPayment' | 'payment') => resource === 'authorizedPayment' ? authorized : { ...payment, transaction_amount: 151 }, findContract: async () => contract };
  assert.deepEqual(await verifyAuthorizedBillingPayment('12', dependencies), { result: 'REVIEW', reason: 'AMOUNT_MISMATCH' });
  await assert.rejects(verifyAuthorizedBillingPayment('12', { ...dependencies, read: async () => { throw new Error('sin conexión'); } }), /sin conexión/);
  assert.deepEqual(await verifyAuthorizedBillingPayment('../12', dependencies), { result: 'REVIEW', reason: 'INVALID_RESOURCE' });
});
