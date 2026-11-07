import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableInventoryRooms } from '../src/lib/availabilityChoices.js';

const rooms = [
  { id: 1, _count: { reservations: 1, reservationRooms: 0 } },
  { id: 2, _count: { reservations: 0, reservationRooms: 1 } },
  { id: 3, _count: { reservations: 1, reservationRooms: 1 } },
  { id: 4, _count: { reservations: 0, reservationRooms: 0 } },
  { id: 5, _count: { reservations: 0, reservationRooms: 0 } },
];

test('excluye ocupación tanto de reservas legadas como de líneas grupales', () => {
  assert.deepEqual(availableInventoryRooms(rooms).map((room) => room.id), [4, 5]);
  assert.equal(rooms.length, 5);
});

test('una habitación seleccionada ocupada no se sustituye por otra libre', () => {
  assert.deepEqual(availableInventoryRooms(rooms, 1), []);
  assert.deepEqual(availableInventoryRooms(rooms, 2), []);
  assert.deepEqual(availableInventoryRooms(rooms, 99), []);
  assert.deepEqual(availableInventoryRooms(rooms, 4).map((room) => room.id), [4]);
});
