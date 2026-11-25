import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingAvailable } from '../src/modules/billing/billing.availability.js';

test('billing queda fuera de producción y admite desarrollo y testing', () => {
  assert.equal(billingAvailable('production'), false);
  assert.equal(billingAvailable(''), false);
  assert.equal(billingAvailable('otro'), false);
  assert.equal(billingAvailable('testing'), true);
  assert.equal(billingAvailable('development'), true);
});
