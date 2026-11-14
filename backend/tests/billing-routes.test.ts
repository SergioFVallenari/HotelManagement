import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiresBillingWriteCheck } from '../src/lib/billingRoutes.js';

test('controla escrituras de la aplicación, no lecturas', () => {
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(requiresBillingWriteCheck(method, '/reservations/1'), true);
  for (const method of ['GET', 'HEAD', 'OPTIONS']) assert.equal(requiresBillingWriteCheck(method, '/reservations/1'), false);
});

test('excluye sesión, billing, rutas públicas y webhooks específicos', () => {
  for (const path of ['/auth/logout', '/mobile/auth/login', '/mobile/auth/login/company', '/billing/checkout', '/public/booking/token', '/mp/webhook', '/integrations/instagram/webhook']) {
    assert.equal(requiresBillingWriteCheck('POST', path), false);
  }
  for (const path of ['/authentic', '/billing-links', '/publicity', '/other/webhook']) {
    assert.equal(requiresBillingWriteCheck('POST', path), true);
  }
});
