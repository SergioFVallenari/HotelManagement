import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityPersonsLimit, publicAvailabilityLimits, publicRoomTypeOptions, summarizeRoomCapacity } from '../src/lib/bookingCapacity.js';

test('reutiliza el inventario completo para capacidad aunque algunas habitaciones estén ocupadas', () => {
  assert.deepEqual(summarizeRoomCapacity([
    { capacity: 2, maxExtraBeds: 1 },
    { capacity: 4, maxExtraBeds: 0 },
  ]), { roomCount: 2, capacity: 6, extraBeds: 1 });
  assert.deepEqual(summarizeRoomCapacity([]), { roomCount: 0, capacity: 0, extraBeds: 0 });
});

test('sin límite configurado se usa toda la capacidad del hotel', () => {
  assert.equal(availabilityPersonsLimit(32), 32);
  assert.equal(availabilityPersonsLimit(32, null), 32);
});

test('el límite configurado puede ser menor que la capacidad', () => {
  assert.equal(availabilityPersonsLimit(32, 12), 12);
});

test('el límite se ajusta si disminuye la capacidad del hotel', () => {
  assert.equal(availabilityPersonsLimit(8, 12), 8);
  assert.equal(availabilityPersonsLimit(0, 12), 0);
});

test('solo aumenta el máximo público cuando el hotel habilita camas extra con servicio válido', () => {
  assert.deepEqual(publicAvailabilityLimits(4, 1, false), { maxAvailabilityPersons: 4, maxAvailabilityPersonsWithExtraBeds: 4 });
  assert.deepEqual(publicAvailabilityLimits(4, 1, true), { maxAvailabilityPersons: 4, maxAvailabilityPersonsWithExtraBeds: 5 });
  assert.deepEqual(publicAvailabilityLimits(0, 0, true), { maxAvailabilityPersons: 0, maxAvailabilityPersonsWithExtraBeds: 0 });
});

test('el máximo configurado del hotel se respeta con y sin aceptación de camas extra', () => {
  assert.deepEqual(publicAvailabilityLimits(4, 2, true, 5), { maxAvailabilityPersons: 4, maxAvailabilityPersonsWithExtraBeds: 5 });
  assert.deepEqual(publicAvailabilityLimits(4, 2, true, 3), { maxAvailabilityPersons: 3, maxAvailabilityPersonsWithExtraBeds: 3 });
});

test('cada tipo informa su propia cantidad de habitaciones y capacidad, sin mezclar categorías', () => {
  const types = [
    { id: 1, name: 'Doble', rooms: [{ capacity: 2, maxExtraBeds: 1 }, { capacity: 2, maxExtraBeds: 0 }] },
    { id: 2, name: 'Familiar', rooms: [{ capacity: 4, maxExtraBeds: 1 }] },
    { id: 3, name: 'Sin habitaciones activas', rooms: [] },
  ];
  assert.deepEqual(publicRoomTypeOptions(types, true), [
    { id: 1, name: 'Doble', roomCount: 2, maxAvailabilityPersons: 4, maxAvailabilityPersonsWithExtraBeds: 5 },
    { id: 2, name: 'Familiar', roomCount: 1, maxAvailabilityPersons: 4, maxAvailabilityPersonsWithExtraBeds: 5 },
  ]);
  assert.deepEqual(publicRoomTypeOptions(types, false, 3), [
    { id: 1, name: 'Doble', roomCount: 2, maxAvailabilityPersons: 3, maxAvailabilityPersonsWithExtraBeds: 3 },
    { id: 2, name: 'Familiar', roomCount: 1, maxAvailabilityPersons: 3, maxAvailabilityPersonsWithExtraBeds: 3 },
  ]);
});
