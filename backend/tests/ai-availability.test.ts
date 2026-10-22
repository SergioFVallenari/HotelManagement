import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_AVAILABILITY_DAYS, buildAvailability, describeDay } from '../src/modules/ai/ai.availability.js';

const FROM = new Date(Date.UTC(2026, 9, 21));
const ROOMS = [
  { id: 1, typeName: 'Doble', capacity: 2 },
  { id: 2, typeName: 'Doble', capacity: 3 },
  { id: 3, typeName: 'Simple', capacity: 1 },
];

function day(result: ReturnType<typeof buildAvailability>, date: string) {
  const found = result.find((item) => item.date === date);
  assert.ok(found, `falta el día ${date}`);
  return found;
}

test('describeDay devuelve fecha y día de la semana en UTC', () => {
  assert.deepEqual(describeDay(FROM), { date: '2026-10-21', weekday: 'mié' });
  assert.deepEqual(describeDay(new Date(Date.UTC(2026, 9, 23))), { date: '2026-10-23', weekday: 'vie' });
});

test('una reserva ocupa las noches del check-in al día previo al check-out', () => {
  const result = buildAvailability(ROOMS, [
    { roomId: 1, checkIn: new Date(Date.UTC(2026, 9, 22)), checkOut: new Date(Date.UTC(2026, 9, 24)), status: 'RESERVED' },
  ], FROM);

  assert.deepEqual(
    day(result, '2026-10-22').types,
    [
      { name: 'Doble', capacity: 3, free: 1, total: 2 },
      { name: 'Simple', capacity: 1, free: 1, total: 1 },
    ],
  );
  assert.deepEqual(day(result, '2026-10-23').types[0], { name: 'Doble', capacity: 3, free: 1, total: 2 });
  assert.deepEqual(day(result, '2026-10-24').types[0], { name: 'Doble', capacity: 3, free: 2, total: 2 });
  assert.deepEqual(day(result, '2026-10-21').types[0], { name: 'Doble', capacity: 3, free: 2, total: 2 });
});

test('las reservas canceladas no ocupan habitaciones', () => {
  const result = buildAvailability(ROOMS, [
    { roomId: 1, checkIn: new Date(Date.UTC(2026, 9, 21)), checkOut: new Date(Date.UTC(2026, 9, 23)), status: 'CANCELLED' },
  ], FROM);

  assert.equal(day(result, '2026-10-21').types[0].free, 2);
  assert.equal(day(result, '2026-10-22').types[0].free, 2);
});

test('una reserva de un tipo no afecta a los demás tipos', () => {
  const result = buildAvailability(ROOMS, [
    { roomId: 3, checkIn: new Date(Date.UTC(2026, 9, 21)), checkOut: new Date(Date.UTC(2026, 9, 22)), status: 'CHECKED_IN' },
  ], FROM);

  assert.deepEqual(day(result, '2026-10-21').types, [
    { name: 'Doble', capacity: 3, free: 2, total: 2 },
    { name: 'Simple', capacity: 1, free: 0, total: 1 },
  ]);
});

test('la ventana por defecto es de 30 días consecutivos', () => {
  const result = buildAvailability(ROOMS, [], FROM);

  assert.equal(result.length, AI_AVAILABILITY_DAYS);
  assert.equal(result[0].date, '2026-10-21');
  assert.equal(result[29].date, '2026-11-19');
});

test('sin habitaciones el día queda sin tipos', () => {
  const result = buildAvailability([], [], FROM, 1);

  assert.deepEqual(result, [{ date: '2026-10-21', weekday: 'mié', types: [] }]);
});
