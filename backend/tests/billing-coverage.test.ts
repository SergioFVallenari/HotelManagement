import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCoverAdditionalHotel, evaluateHotelCoverage, TRIAL_MAX_HOTELS } from '../src/modules/billing/billing.coverage.js';

test('trial permite cubrir hasta tres hoteles sin reiniciar la cobertura existente', () => {
  assert.equal(TRIAL_MAX_HOTELS, 3);
  assert.equal(canCoverAdditionalHotel({ hotelId: 3, coveredHotelIds: [1, 2], maximum: TRIAL_MAX_HOTELS }), true);
  assert.equal(canCoverAdditionalHotel({ hotelId: 4, coveredHotelIds: [1, 2, 3], maximum: TRIAL_MAX_HOTELS }), false);
  assert.equal(canCoverAdditionalHotel({ hotelId: 2, coveredHotelIds: [1, 2, 3], maximum: TRIAL_MAX_HOTELS }), true);
});

test('un plan con menos cupos conserva los hoteles registrados, pero no agrega cobertura', () => {
  const result = evaluateHotelCoverage({ hotelId: 2, coveredHotelIds: [1, 2, 3], maximum: 1 });
  assert.deepEqual(result, { covered: true, maximum: 1, coveredCount: 3, remaining: 0 });
  assert.equal(canCoverAdditionalHotel({ hotelId: 4, coveredHotelIds: [1, 2, 3], maximum: 1 }), false);
});

test('ignora duplicados y rechaza datos inválidos', () => {
  assert.equal(evaluateHotelCoverage({ hotelId: 2, coveredHotelIds: [1, 1], maximum: 3 }).coveredCount, 1);
  assert.throws(() => evaluateHotelCoverage({ hotelId: 0, coveredHotelIds: [], maximum: 3 }));
  assert.throws(() => evaluateHotelCoverage({ hotelId: 1, coveredHotelIds: [-1], maximum: 3 }));
  assert.throws(() => evaluateHotelCoverage({ hotelId: 1, coveredHotelIds: [], maximum: -1 }));
});
