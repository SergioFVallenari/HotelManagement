import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMercadoPagoBillingNotification } from '../src/modules/billing/providers/mercadoPagoEvents.js';
import { billingAmountMatches } from '../src/modules/billing/providers/billingAmount.js';

test('normaliza notificaciones de suscripción sin confundir recurso con evento', () => {
  assert.deepEqual(parseMercadoPagoBillingNotification({ id: 99, type: 'subscription_preapproval', action: 'updated', data: { id: ' sub-1 ' }, live_mode: false }), {
    topic: 'subscription_preapproval', resourceId: 'sub-1', notificationId: '99', action: 'updated', liveMode: false,
  });
  assert.equal(parseMercadoPagoBillingNotification({ type: 'subscription_authorized_payment', data: { id: 123 } })?.resourceId, '123');
  assert.equal(parseMercadoPagoBillingNotification({ type: 'payment', data: { id: 'p-1' } })?.topic, 'payment');
});

test('rechaza eventos ajenos o sin identificador seguro', () => {
  for (const payload of [null, [], {}, { type: 'order', data: { id: '1' } }, { type: 'payment', data: { id: '' } }, { type: 'payment', data: { id: Number.MAX_SAFE_INTEGER + 1 } }]) {
    assert.equal(parseMercadoPagoBillingNotification(payload), null);
  }
});

test('compara importes en centavos exactos y exige moneda ARS', () => {
  const expected = { expectedAmount: '15000.00', expectedCurrency: 'ARS', receivedAmount: '15000', receivedCurrency: 'ARS' };
  assert.equal(billingAmountMatches(expected), true);
  for (const receivedAmount of ['15000.01', '15000.001', '-1', '1e4', 'NaN', '015000']) {
    assert.equal(billingAmountMatches({ ...expected, receivedAmount }), false);
  }
  assert.equal(billingAmountMatches({ ...expected, receivedCurrency: 'USD' }), false);
  assert.equal(billingAmountMatches({ ...expected, expectedAmount: '0', receivedAmount: '0' }), false);
});
