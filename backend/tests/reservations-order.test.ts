import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nearestReservationIds } from '../src/modules/reservations/reservations.order.js';

const date = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = date('2026-11-10');
const rows = [
  { id: 1, checkIn: date('2026-11-09') },
  { id: 2, checkIn: date('2026-11-12') },
  { id: 3, checkIn: date('2026-11-11') },
  { id: 4, checkIn: date('2026-11-10') },
  { id: 5, checkIn: date('2026-11-11') },
  { id: 6, checkIn: date('2026-11-08') },
];

test('ordena por distancia a hoy y prioriza futuras en empate, con desempate estable', () => {
  assert.deepEqual(nearestReservationIds(rows, today, 0, 10), [4, 5, 3, 1, 2, 6]);
  assert.deepEqual(rows.map((row) => row.id), [1, 2, 3, 4, 5, 6]);
});

test('pagina después de combinar fechas pasadas y futuras', () => {
  assert.deepEqual(nearestReservationIds(rows, today, 0, 2), [4, 5]);
  assert.deepEqual(nearestReservationIds(rows, today, 2, 2), [3, 1]);
  assert.deepEqual(nearestReservationIds(rows, today, 6, 2), []);
});
