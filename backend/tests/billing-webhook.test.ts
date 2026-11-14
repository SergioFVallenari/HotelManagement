import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyBillingNotification } from '../src/modules/billing/providers/mercadoPagoWebhook.js';

const secret = 'secreto-de-prueba';
const now = 1_762_000_000_000;
const requestId = 'request-123';
const resourceId = 'ABC123';
const manifest = `id:${resourceId.toLowerCase()};request-id:${requestId};ts:${now};`;
const signature = `ts=${now},v1=${createHmac('sha256', secret).update(manifest).digest('hex')}`;
const input = { body: { id: 123, type: 'payment', live_mode: false, data: { id: resourceId } }, queryResourceId: resourceId, signature, requestId, secret, now };

test('verifica la firma y genera huella estable para un reintento idéntico', () => {
  const first = verifyBillingNotification(input);
  assert.equal(first.resourceId, resourceId);
  assert.equal(first.fingerprint, verifyBillingNotification(input).fingerprint);
  assert.equal(first.fingerprint.length, 64);
});

test('rechaza firma incorrecta, vencida, recurso inconsistente y modo real', () => {
  assert.throws(() => verifyBillingNotification({ ...input, secret: 'otra' }), { code: 'BILLING_WEBHOOK_SIGNATURE' });
  assert.throws(() => verifyBillingNotification({ ...input, now: now + 301_000 }), { code: 'BILLING_WEBHOOK_SIGNATURE' });
  assert.throws(() => verifyBillingNotification({ ...input, queryResourceId: 'otro' }), { code: 'BILLING_WEBHOOK_INVALID' });
  assert.throws(() => verifyBillingNotification({ ...input, body: { ...input.body, live_mode: true } }), { code: 'BILLING_WEBHOOK_INVALID' });
  assert.throws(() => verifyBillingNotification({ ...input, body: { ...input.body, live_mode: undefined } }), { code: 'BILLING_WEBHOOK_INVALID' });
});
