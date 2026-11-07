import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomSelectionsTotal, validateRoomSelections } from '../src/lib/reservationRooms.js';
import { createReservationSchema, updateReservationSchema } from '../src/modules/reservations/reservations.schema.js';
import { createBookingLinkSchema } from '../src/modules/booking/booking.schema.js';

const rooms = Array.from({ length: 4 }, (_, index) => ({ id: index + 1, capacity: 4, maxExtraBeds: 1 }));
const selections = rooms.map((room) => ({ roomId: room.id, persons: 4, extraBeds: 0 }));
const stay = { checkIn: '2026-12-01', checkOut: '2026-12-03' };
const guest = { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com', phone: '1122334455' };

test('una reserva puede distribuir 16 personas en cuatro habitaciones', () => {
  assert.equal(validateRoomSelections(selections, rooms), null);
  const parsed = createReservationSchema.parse({ ...stay, guest, rooms: selections });
  assert.equal(parsed.rooms?.reduce((sum, line) => sum + line.persons, 0), 16);
  assert.equal(createBookingLinkSchema.parse({ ...stay, rooms: selections }).rooms?.length, 4);
});

test('rechaza habitaciones repetidas, inexistentes y reservas sin habitaciones', () => {
  assert.ok(validateRoomSelections([selections[0]!, selections[0]!], rooms));
  assert.ok(validateRoomSelections([{ roomId: 9, persons: 1, extraBeds: 0 }], rooms));
  assert.equal(createReservationSchema.safeParse({ ...stay, guest }).success, false);
  assert.equal(createBookingLinkSchema.safeParse({ ...stay }).success, false);
  assert.equal(createReservationSchema.safeParse({ ...stay, guest, rooms: [selections[0], selections[0]] }).success, false);
  assert.equal(updateReservationSchema.safeParse({ rooms: [] }).success, false);
});

test('valida personas y camas extras por habitación, no contra la capacidad conjunta', () => {
  assert.ok(validateRoomSelections([{ roomId: 1, persons: 5, extraBeds: 0 }], rooms));
  assert.ok(validateRoomSelections([{ roomId: 1, persons: 3, extraBeds: 1 }], rooms));
  assert.ok(validateRoomSelections([{ roomId: 1, persons: 4, extraBeds: 2 }], rooms));
  assert.ok(validateRoomSelections([{ roomId: 1, persons: 0, extraBeds: 0 }], rooms));
  assert.equal(validateRoomSelections([{ roomId: 1, persons: 4, extraBeds: 1 }], rooms), null);
});

test('suma habitaciones con tarifas mixtas y redondea importes', () => {
  assert.equal(roomSelectionsTotal(selections.map((line) => ({ ...line, roomPrice: 10000, roomPricingMode: 'PER_NIGHT' })), 2), 80000);
  assert.equal(roomSelectionsTotal([
    { persons: 4, roomPrice: 10000, roomPricingMode: 'PER_NIGHT' },
    { persons: 3, roomPrice: 2000.15, roomPricingMode: 'PER_PERSON' },
  ], 2), 32000.9);
});

test('mantiene compatible la creación con una sola habitación', () => {
  assert.equal(createReservationSchema.parse({ ...stay, guest, roomId: 1, persons: 2 }).roomId, 1);
  assert.equal(createBookingLinkSchema.parse({ ...stay, roomId: 1, persons: 2 }).roomId, 1);
});
