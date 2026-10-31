import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateAvailableRooms, type AvailableRoom } from '../src/lib/availability.js';

const room = (capacity: number, price = 100, pricingMode: AvailableRoom['pricingMode'] = 'PER_NIGHT'): AvailableRoom => ({
  roomType: 'Estándar', capacity, price, pricingMode,
});

test('16 personas se distribuyen en cuatro habitaciones cuádruples', () => {
  const result = allocateAvailableRooms(Array.from({ length: 4 }, () => room(4)), 16, 2);
  assert.equal(result?.roomCount, 4);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [4, 4, 4, 4]);
  assert.equal(result?.total, 800);
});

test('respeta la cantidad exacta de habitaciones solicitada', () => {
  const result = allocateAvailableRooms([room(4, 100), room(2, 10), room(2, 20)], 4, 2, 2);
  assert.equal(result?.roomCount, 2);
  assert.equal(result?.total, 60);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [2, 2]);
  assert.equal(allocateAvailableRooms([room(4), room(4)], 3, 1, 3), null);
  assert.equal(allocateAvailableRooms([room(4), room(4)], 1, 1, 2), null);
});

test('sin capacidad total suficiente no hay combinación', () => {
  assert.equal(allocateAvailableRooms([room(4), room(4), room(4)], 16, 1), null);
  assert.equal(allocateAvailableRooms([], 1, 1), null);
});

test('no reutiliza habitaciones y asigna exactamente las personas solicitadas', () => {
  const result = allocateAvailableRooms([room(4), room(4)], 5, 1);
  assert.equal(result?.roomCount, 2);
  assert.equal(result?.rooms.reduce((sum, item) => sum + item.persons, 0), 5);
  assert.ok(result?.rooms.every((item) => item.persons > 0 && item.persons <= item.capacity));
});

test('prioriza menos habitaciones y luego el menor precio', () => {
  const result = allocateAvailableRooms([room(2, 10), room(2, 10), room(4, 100), room(4, 80)], 4, 1);
  assert.equal(result?.roomCount, 1);
  assert.equal(result?.total, 80);
});

test('admite tipos y capacidades diferentes', () => {
  const result = allocateAvailableRooms([room(2), { ...room(3), roomType: 'Triple' }], 5, 1);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [2, 3]);
  assert.equal(result?.rooms[1]?.roomType, 'Triple');
});

test('el precio por persona usa las personas asignadas, no toda la capacidad', () => {
  const result = allocateAvailableRooms([room(4, 50, 'PER_PERSON'), room(4, 10, 'PER_PERSON')], 5, 2);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [1, 4]);
  assert.equal(result?.total, 180);
});

test('combina precios por habitación y por persona sin duplicar huéspedes', () => {
  const result = allocateAvailableRooms([room(4, 100), room(4, 10, 'PER_PERSON')], 5, 2);
  assert.equal(result?.total, 220);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [4, 1]);
});
