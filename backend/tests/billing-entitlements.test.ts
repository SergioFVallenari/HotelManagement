import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateObservation } from '../src/modules/billing/billing.entitlements.js';

const now = new Date('2026-11-12T00:00:00Z');
const trialEndsAt = new Date('2026-11-26T00:00:00Z');

test('el trial observa 5 habitaciones y 3 usuarios activos por hotel', () => {
  for (const [limit, maximum] of [['MAX_ROOMS', 5], ['MAX_USERS', 3]] as const) {
    assert.deepEqual(evaluateObservation({ status: 'TRIALING', trialEndsAt, now, limit, activeCount: maximum }), {
      effectiveStatus: 'TRIALING', maximum, exceeded: false,
    });
    assert.equal(evaluateObservation({ status: 'TRIALING', trialEndsAt, now, limit, activeCount: maximum + 1 }).exceeded, true);
  }
});

test('el estado grandfathered no recibe límites provisionales', () => {
  assert.deepEqual(evaluateObservation({ status: 'GRANDFATHERED', trialEndsAt: null, now, limit: 'MAX_ROOMS', activeCount: 100 }), {
    effectiveStatus: 'GRANDFATHERED', maximum: null, exceeded: false,
  });
});

test('una operación posterior al vencimiento se identifica aunque no exceda el límite', () => {
  assert.deepEqual(evaluateObservation({ status: 'TRIALING', trialEndsAt: now, now, limit: 'MAX_USERS', activeCount: 1 }), {
    effectiveStatus: 'EXPIRED', maximum: 3, exceeded: false,
  });
});
