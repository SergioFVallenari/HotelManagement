import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availabilityPersonsLimit } from '../src/lib/bookingCapacity.js';

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
