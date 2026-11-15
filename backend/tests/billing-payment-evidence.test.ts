import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyBillingPaymentEvidence } from '../src/modules/billing/providers/billingEvidence.js';
import { readMercadoPagoBillingResource } from '../src/modules/billing/providers/mercadoPagoRead.js';

const authorized = { id: 12, preapproval_id: 'sub-1', external_reference: 'LAIXIA-CONTRACT-42', status: 'processed', debit_date: '2026-11-14T12:00:00Z', transaction_amount: '150.00', currency_id: 'ARS', payment: { id: 34, status: 'approved' } };
const payment = { id: 34, status: 'approved', status_detail: 'accredited', transaction_amount: 150, currency_id: 'ARS', live_mode: false, date_approved: '2026-11-14T12:00:00.000Z' };
const input = { contractId: 42, providerSubscriptionId: 'sub-1', authorizedPaymentId: '12', expectedAmount: '150.00', authorizedPayment: authorized, payment };

test('acepta únicamente evidencia consistente del contrato y pago acreditado de prueba', () => {
  assert.deepEqual(verifyBillingPaymentEvidence(input), { valid: true, paymentId: '34', paidAt: new Date('2026-11-14T12:00:00Z'), scheduledAt: new Date('2026-11-14T12:00:00Z') });
});

test('rechaza referencias cruzadas, pagos rechazados, importes o modo real', () => {
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, authorizedPaymentId: '99' }), { valid: false, reason: 'CONTRACT_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, providerSubscriptionId: 'otro' }), { valid: false, reason: 'CONTRACT_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, id: 35 } }), { valid: false, reason: 'CONTRACT_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, status: 'rejected' } }), { valid: false, reason: 'NOT_APPROVED' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, live_mode: true } }), { valid: false, reason: 'MODE_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, live_mode: undefined } }), { valid: false, reason: 'MODE_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, transaction_amount: 151 } }), { valid: false, reason: 'AMOUNT_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, currency_id: 'USD' } }), { valid: false, reason: 'AMOUNT_MISMATCH' });
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, id: Number.MAX_SAFE_INTEGER + 1 } }), { valid: false, reason: 'INCOMPLETE' });
});

test('no acredita pagos reembolsados, pendientes ni evidencia con fechas ausentes o inválidas', () => {
  for (const status of ['refunded', 'charged_back', 'pending', 'in_process']) {
    assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, status } }), { valid: false, reason: 'NOT_APPROVED' });
  }
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, status_detail: 'partially_refunded' } }), { valid: false, reason: 'NOT_APPROVED' });
  for (const debit_date of [undefined, 'fecha inválida']) {
    assert.deepEqual(verifyBillingPaymentEvidence({ ...input, authorizedPayment: { ...authorized, debit_date } }), { valid: false, reason: 'INCOMPLETE' });
  }
  assert.deepEqual(verifyBillingPaymentEvidence({ ...input, payment: { ...payment, date_approved: undefined } }), { valid: false, reason: 'INCOMPLETE' });
});

test('consulta solo endpoints fijos de prueba, sin seguir redirecciones', async () => {
  const calls: string[] = [];
  const transport: typeof fetch = async (url, options) => {
    calls.push(String(url));
    assert.equal(options?.redirect, 'error');
    return new Response(JSON.stringify({ id: 12 }));
  };
  const options = { enabled: true, environment: 'testing' as const, accessToken: 'token-prueba', transport };
  await readMercadoPagoBillingResource('authorizedPayment', '12', options);
  await readMercadoPagoBillingResource('payment', '34', options);
  await readMercadoPagoBillingResource('subscription', 'sub-1', options);
  assert.deepEqual(calls, ['https://api.mercadopago.com/authorized_payments/12', 'https://api.mercadopago.com/v1/payments/34', 'https://api.mercadopago.com/preapproval/sub-1']);
  await assert.rejects(readMercadoPagoBillingResource('payment', '../etc', options));
  await assert.rejects(readMercadoPagoBillingResource('payment', '1', { ...options, environment: 'production' }));
  assert.equal(calls.length, 3);
});
