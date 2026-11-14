import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateMonthlyPaidPeriod, trialIsActive } from '../src/modules/billing/billing.period.js';

test('un pago anticipado conserva el trial completo', () => {
  const period = calculateMonthlyPaidPeriod({ paidAt: new Date('2026-11-10T12:00:00Z'), trialEndsAt: new Date('2026-11-14T12:00:00Z'), previousPeriodEnd: null });
  assert.equal(period.startsAt.toISOString(), '2026-11-14T12:00:00.000Z');
  assert.equal(period.endsAt.toISOString(), '2026-12-14T12:00:00.000Z');
});

test('una renovación no se solapa y un pago tardío no inventa cobertura previa', () => {
  const previousPeriodEnd = new Date('2026-12-14T12:00:00Z');
  const early = calculateMonthlyPaidPeriod({ paidAt: new Date('2026-12-10T12:00:00Z'), trialEndsAt: null, previousPeriodEnd });
  assert.equal(early.startsAt.toISOString(), previousPeriodEnd.toISOString());
  const late = calculateMonthlyPaidPeriod({ paidAt: new Date('2026-12-16T12:00:00Z'), trialEndsAt: null, previousPeriodEnd });
  assert.equal(late.startsAt.toISOString(), '2026-12-16T12:00:00.000Z');
});

test('suma un mes calendario UTC ajustando el último día y rechaza fechas inválidas', () => {
  const period = calculateMonthlyPaidPeriod({ paidAt: new Date('2028-01-31T23:45:12.123Z'), trialEndsAt: null, previousPeriodEnd: null });
  assert.equal(period.endsAt.toISOString(), '2028-02-29T23:45:12.123Z');
  assert.throws(() => calculateMonthlyPaidPeriod({ paidAt: new Date('invalid'), trialEndsAt: null, previousPeriodEnd: null }));
});

test('el trial termina exactamente en trialEndsAt', () => {
  const end = new Date('2026-11-14T12:00:00Z');
  assert.equal(trialIsActive(end, new Date(end.getTime() - 1)), true);
  assert.equal(trialIsActive(end, end), false);
  assert.equal(trialIsActive(null, end), false);
});
