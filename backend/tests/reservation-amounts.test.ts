import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateReservationAmounts, readReservationAmounts } from '../src/lib/reservationAmounts.js';

test('calcula total grupal y anticipo una vez para guardarlos', () => {
  const amounts = calculateReservationAmounts([
    { roomPrice: 50000, roomPricingMode: 'PER_NIGHT', persons: 2 },
    { roomPrice: 10000, roomPricingMode: 'PER_PERSON', persons: 3 },
  ], 3, [{ quantity: 2, unitPrice: 5000 }], 20);
  assert.deepEqual(amounts, { totalAmount: 250000, depositRequired: 50000 });
});

test('recalcula importes cuando cambia la estadía', () => {
  const rooms = [{ roomPrice: 60000, roomPricingMode: 'PER_NIGHT' as const, persons: 2 }];
  assert.deepEqual(calculateReservationAmounts(rooms, 2, [], 20), { totalAmount: 120000, depositRequired: 20000 });
  assert.deepEqual(calculateReservationAmounts(rooms, 4, [], 20), { totalAmount: 240000, depositRequired: 50000 });
});

test('respeta el anticipo de 7500 ingresado aunque el automático sea 10000', () => {
  const rooms = [{ roomPrice: 50000, roomPricingMode: 'PER_NIGHT' as const, persons: 2 }];
  assert.equal(calculateReservationAmounts(rooms, 1, [], 20).depositRequired, 10000);
  assert.deepEqual(calculateReservationAmounts(rooms, 1, [], 20, 7500), { totalAmount: 50000, depositRequired: 7500 });
  assert.equal(calculateReservationAmounts(rooms, 1, [], 20, 0).depositRequired, 0);
});

test('usa montos congelados y solo calcula pagos y saldo', () => {
  assert.deepEqual(readReservationAmounts({ totalAmount: '123456.78', depositRequired: '30000' }, [{ amount: '10000.01' }, { amount: 20000 }]), {
    totalAmount: 123456.78, depositRequired: 30000, amountPaid: 30000.01, balance: 93456.77,
  });
});

test('el anticipo requerido no cambia cuando se registra un pago', () => {
  const amounts = { totalAmount: 100000, depositRequired: 20000 };
  assert.equal(readReservationAmounts(amounts).depositRequired, 20000);
  assert.equal(readReservationAmounts(amounts, [{ amount: 100000 }]).depositRequired, 20000);
  assert.equal(readReservationAmounts(amounts, [{ amount: 100000 }]).balance, 0);
});

test('respeta total y anticipo cero sin recalcularlos', () => {
  assert.deepEqual(readReservationAmounts({ totalAmount: 0, depositRequired: 0 }), { totalAmount: 0, depositRequired: 0, amountPaid: 0, balance: 0 });
  assert.equal(calculateReservationAmounts([{ roomPrice: 1000, roomPricingMode: 'PER_NIGHT', persons: 1 }], 1, [], 0).depositRequired, 0);
});

test('no interpreta importes pendientes de migración como reservas gratuitas', () => {
  assert.throws(() => readReservationAmounts({ totalAmount: null, depositRequired: 0 }), /migración/);
  assert.throws(() => readReservationAmounts({ totalAmount: 100000, depositRequired: null }), /migración/);
});
