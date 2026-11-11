import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reservationDeletionError, type DeletionState } from '../src/modules/reservations/reservations.delete.js';

const base: DeletionState = { status: 'RESERVED', hasStayActivity: false, refundEligible: false, refunded: false, refundAmount: null, mpOrderId: null, mpCheckoutUrl: null, payments: [] };

test('permite reservas sin movimientos y pagos con devolución total registrada', () => {
  assert.equal(reservationDeletionError(base), null);
  assert.equal(reservationDeletionError({ ...base, status: 'CANCELLED', refundEligible: true, refunded: true, refundAmount: 150, payments: [{ amount: 100, method: 'CASH' }, { amount: 50, method: 'TRANSFER' }] }), null);
  assert.equal(reservationDeletionError({ ...base, status: 'CANCELLED', payments: [{ amount: 100, method: 'CASH' }] }), null);
});

test('rechaza pagos sin devolución total y actividad de estadía', () => {
  assert.ok(reservationDeletionError({ ...base, payments: [{ amount: 100, method: 'CASH' }] }));
  assert.ok(reservationDeletionError({ ...base, status: 'CANCELLED', refundEligible: true, refunded: false, payments: [{ amount: 100, method: 'CASH' }] }));
  assert.ok(reservationDeletionError({ ...base, status: 'CANCELLED', refundEligible: true, refunded: true, refundAmount: 99, payments: [{ amount: 100, method: 'CASH' }] }));
  assert.ok(reservationDeletionError({ ...base, status: 'CANCELLED', hasStayActivity: true }));
});

test('conserva reservas con operaciones de MercadoPago', () => {
  assert.ok(reservationDeletionError({ ...base, mpOrderId: 'orden' }));
  assert.ok(reservationDeletionError({ ...base, status: 'CANCELLED', refunded: true, refundAmount: 100, payments: [{ amount: 100, method: 'MERCADOPAGO' }] }));
});
