import { test } from 'node:test';
import assert from 'node:assert/strict';
import { testCheckoutAvailable } from '../src/modules/billing/billing.checkoutAvailability.js';

const config = { enabled: true, webhookEnabled: true, accessToken: 'prueba', webhookSecret: 'secreto', monthlyPrice: '150.00' };

test('el checkout requiere configuración completa y precio válido', () => {
  assert.equal(testCheckoutAvailable(config), true);
  for (const overrides of [{ enabled: false }, { webhookEnabled: false }, { accessToken: '' }, { webhookSecret: '' }, { monthlyPrice: '0' }, { monthlyPrice: '1e3' }, { monthlyPrice: '1.234' }]) {
    assert.equal(testCheckoutAvailable({ ...config, ...overrides }), false);
  }
});
