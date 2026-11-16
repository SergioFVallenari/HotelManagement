import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveBillingStatus } from '../src/modules/billing/billing.status.js';

const end = new Date('2026-11-26T12:00:00.000Z');

test('trial válido hasta el instante anterior al vencimiento', () => {
  assert.deepEqual(effectiveBillingStatus('TRIALING', end, new Date('2026-11-26T11:59:59.999Z')), { status: 'TRIALING', daysRemaining: 1 });
  assert.deepEqual(effectiveBillingStatus('TRIALING', end, new Date('2026-11-12T12:00:00.000Z')), { status: 'TRIALING', daysRemaining: 14 });
});

test('trial vencido en la fecha exacta y después', () => {
  for (const now of [end, new Date('2026-11-27T12:00:00.000Z')]) {
    assert.deepEqual(effectiveBillingStatus('TRIALING', end, now), { status: 'EXPIRED', daysRemaining: 0 });
  }
});

test('empresas existentes conservan estado sin fecha', () => {
  assert.deepEqual(effectiveBillingStatus('GRANDFATHERED', null, end), { status: 'GRANDFATHERED', daysRemaining: null });
});

test('una suscripción vencida no revive y una fecha faltante falla', () => {
  assert.equal(effectiveBillingStatus('EXPIRED', end, new Date('2026-11-12T12:00:00.000Z')).status, 'EXPIRED');
  assert.throws(() => effectiveBillingStatus('TRIALING', null, end));
});

test('un período pago vigente habilitado representa acceso activo sin cambiar el trial', () => {
  assert.deepEqual(effectiveBillingStatus('TRIALING', end, end, true), { status: 'ACTIVE', daysRemaining: null });
  assert.deepEqual(effectiveBillingStatus('EXPIRED', end, end, true), { status: 'ACTIVE', daysRemaining: null });
  assert.deepEqual(effectiveBillingStatus('GRANDFATHERED', null, end, true), { status: 'GRANDFATHERED', daysRemaining: null });
});
