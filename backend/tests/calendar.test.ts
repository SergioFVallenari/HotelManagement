import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarCells, calendarRoomIds, publicCalendarData } from '../src/lib/calendar.js';

const reservation = { id: 9, code: 'RSV-TEST', status: 'RESERVED', checkIn: '2026-11-03', checkOut: '2026-11-05', guestName: 'Huésped privado' };

test('la entrada ocupa la noche y la salida queda libre', () => {
  const cells = calendarCells(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'], [reservation]);
  assert.deepEqual(cells.map((cell) => cell.status), ['AVAILABLE', 'OCCUPIED', 'OCCUPIED', 'AVAILABLE']);
});

test('salida y nueva entrada bloquean esa noche y conservan ambas referencias internas', () => {
  const next = { ...reservation, id: 10, checkIn: '2026-11-05', checkOut: '2026-11-07' };
  const [cell] = calendarCells(['2026-11-05'], [reservation, next]);
  assert.equal(cell?.status, 'TURNOVER');
  assert.deepEqual(cell?.reservations.map((item) => item.id), [9, 10]);
});

test('reservas grupales incluyen todas sus habitaciones sin duplicar la principal', () => {
  assert.deepEqual(calendarRoomIds({ roomId: 1, rooms: [{ roomId: 1 }, { roomId: 2 }, { roomId: 3 }] }), [1, 2, 3]);
  assert.deepEqual(calendarRoomIds({ roomId: 1, rooms: [] }), [1]);
});

test('el calendario público conserva identificación real y elimina toda referencia privada', () => {
  const days = ['2026-11-03', '2026-11-05'];
  const data = publicCalendarData({ from: days[0]!, to: days[1]!, days, rooms: [{
    id: 1, number: '101', name: 'Vista al jardín', typeName: 'Doble', capacity: 2, maxExtraBeds: 1, cells: calendarCells(days, [reservation]),
  }] });
  assert.deepEqual(data.rooms, [{ id: 1, number: '101', name: 'Vista al jardín', typeName: 'Doble', capacity: 2, maxExtraBeds: 1, cells: [{ available: false }, { available: true }] }]);
  assert.equal(JSON.stringify(data).includes(reservation.guestName), false);
  assert.equal(JSON.stringify(data).includes(reservation.code), false);
});
