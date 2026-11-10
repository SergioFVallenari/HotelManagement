import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createReservationBatchSchema, createReservationSchema } from '../src/modules/reservations/reservations.schema.js';
import { reservationGuestWrite } from '../src/lib/guestIdentity.js';

const draft = { roomId: 1, persons: 2, checkIn: '2026-12-01', checkOut: '2026-12-02', genericGuest: true };

test('admite reservas independientes con huéspedes genéricos y cobros propios', () => {
  const result = createReservationBatchSchema.parse({ reservations: [draft, { ...draft, roomId: 2, payment: { amount: 5000, method: 'CASH' } }] });
  assert.equal(result.reservations.length, 2);
  assert.equal(result.reservations[0]!.genericGuest, true);
  assert.equal(result.reservations[1]!.payment!.amount, 5000);
});

test('el huésped genérico es explícito y excluye datos o id de otro huésped', () => {
  assert.equal(createReservationSchema.safeParse({ ...draft, genericGuest: false }).success, false);
  assert.equal(createReservationSchema.safeParse({ ...draft, guestId: 1 }).success, false);
  assert.equal(createReservationSchema.safeParse({ ...draft, guest: { firstName: 'Ana', lastName: 'Pérez' } }).success, false);
});

test('cada huésped sin contacto genera una ficha nueva, nunca un upsert compartido', () => {
  const write = reservationGuestWrite(7, { firstName: 'Huésped', lastName: 'genérico' });
  assert.equal(write.kind, 'create');
  if (write.kind === 'create') assert.equal(write.data.companyId, 7);
});

test('rechaza lotes vacíos, excesivos o con una reserva inválida', () => {
  for (const reservations of [[], Array.from({ length: 51 }, () => draft), [draft, { ...draft, persons: 0 }]]) {
    assert.equal(createReservationBatchSchema.safeParse({ reservations }).success, false);
  }
});

test('la carga conjunta rechaza pagos y órdenes de MercadoPago', () => {
  for (const item of [{ ...draft, generatePaymentLink: true }, { ...draft, payment: { amount: 1000, method: 'MERCADOPAGO' } }]) {
    assert.equal(createReservationBatchSchema.safeParse({ reservations: [item] }).success, false);
  }
});

test('conserva la carga individual con huésped nuevo o existente', () => {
  assert.equal(createReservationSchema.safeParse({ ...draft, genericGuest: undefined, guestId: 5 }).success, true);
  assert.equal(createReservationSchema.safeParse({ ...draft, genericGuest: undefined, guest: { firstName: 'Ana', lastName: 'Pérez' } }).success, true);
});
