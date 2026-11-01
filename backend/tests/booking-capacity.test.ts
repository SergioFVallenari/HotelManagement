import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityPersonsLimit, publicAvailabilityLimits } from '../src/lib/bookingCapacity.js';

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
