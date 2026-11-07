import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertDiscountPermission, calculateDiscount } from '../src/lib/discount.js';
import { calculateReservationAmounts } from '../src/lib/reservationAmounts.js';
import { discountSchema, createReservationSchema } from '../src/modules/reservations/reservations.schema.js';
import { createBookingLinkSchema, publicBookingSchema } from '../src/modules/booking/booking.schema.js';
import { buildShareMessage } from '../src/modules/booking/booking.share.js';

test('sin descuento mantiene el total y admite cero', () => {
  assert.deepEqual(calculateDiscount(120000), { discountAmount: 0, total: 120000 });
  assert.deepEqual(calculateDiscount(0), { discountAmount: 0, total: 0 });
});

test('porcentaje y monto fijo se redondean a centavos', () => {
  assert.deepEqual(calculateDiscount(123456.78, { type: 'PERCENTAGE', value: 12.5 }), { discountAmount: 15432.1, total: 108024.68 });
  assert.deepEqual(calculateDiscount(123456.78, { type: 'FIXED', value: 20000.55 }), { discountAmount: 20000.55, total: 103456.23 });
  assert.deepEqual(calculateDiscount(100, { type: 'PERCENTAGE', value: 100 }), { discountAmount: 100, total: 0 });
  assert.deepEqual(calculateDiscount(100, { type: 'FIXED', value: 100 }), { discountAmount: 100, total: 0 });
});

test('rechaza negativos, porcentajes mayores al 100%, montos mayores al subtotal y valores no finitos', () => {
  for (const value of [-1, 101, NaN, Infinity]) assert.throws(() => calculateDiscount(100, { type: 'PERCENTAGE', value }));
  assert.throws(() => calculateDiscount(100, { type: 'FIXED', value: 100.01 }));
  assert.equal(discountSchema.safeParse({ type: 'FIXED', value: 1.234 }).success, false);
  assert.equal(discountSchema.safeParse({ type: 'PERCENTAGE', value: 101 }).success, false);
});

test('solo ADMIN y OWNER pueden aplicar descuentos', () => {
  const discount = { type: 'FIXED' as const, value: 100 };
  for (const role of ['ADMIN', 'OWNER']) assert.doesNotThrow(() => assertDiscountPermission(discount, role));
  for (const role of ['RECEPCIONISTA', undefined]) assert.throws(() => assertDiscountPermission(discount, role), { statusCode: 403 });
  assert.doesNotThrow(() => assertDiscountPermission(undefined, 'RECEPCIONISTA'));
});

test('descuenta alojamiento grupal y servicios antes de calcular el anticipo', () => {
  const rooms = [{ roomPrice: 50000, roomPricingMode: 'PER_NIGHT' as const, persons: 2 }, { roomPrice: 10000, roomPricingMode: 'PER_PERSON' as const, persons: 3 }];
  const services = [{ quantity: 2, unitPrice: 5000 }];
  assert.deepEqual(calculateReservationAmounts(rooms, 3, services, 20, undefined, { type: 'PERCENTAGE', value: 20 }), { totalAmount: 200000, depositRequired: 40000 });
  assert.deepEqual(calculateReservationAmounts(rooms, 3, services, 20, 15000, { type: 'FIXED', value: 50000 }), { totalAmount: 200000, depositRequired: 15000 });
});

test('la reserva manual y el link aceptan el descuento, el huésped no lo puede enviar', () => {
  const stay = { roomId: 1, checkIn: '2026-12-01', checkOut: '2026-12-03', discount: { type: 'PERCENTAGE', value: 10 } };
  assert.deepEqual(createReservationSchema.parse({ ...stay, guestId: 1 }).discount, stay.discount);
  assert.deepEqual(createBookingLinkSchema.parse(stay).discount, stay.discount);
  const guest = publicBookingSchema.parse({ firstName: 'Ana', lastName: 'Pérez', phone: '123456789', email: 'ana@example.com', discount: stay.discount });
  assert.equal('discount' in guest, false);
});

test('el mensaje compartido muestra el descuento aplicado y no solicita transferencia si el total es cero', () => {
  const message = buildShareMessage({ hotelName: 'Hotel', roomLabel: 'Doble', checkIn: '2026-12-01', checkOut: '2026-12-02', nights: 1, total: 0, deposit: 0, discountAmount: 50000, url: 'https://hotel.test/reserva/token' });
  assert.match(message, /Descuento aplicado \$50\.000/);
  assert.doesNotMatch(message, /transferir/);
});
