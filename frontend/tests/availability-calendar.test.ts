import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarStayError, shiftCalendarDay } from '../src/lib/availabilityCalendar.ts';

test('permite salir en una fecha ocupada si las noches anteriores están libres', () => {
  assert.equal(calendarStayError('2026-11-03', '2026-11-05', new Map([
    ['2026-11-03', true], ['2026-11-04', true], ['2026-11-05', false],
  ])), null);
});

test('rechaza una noche ocupada intermedia o una fecha sin datos', () => {
  assert.ok(calendarStayError('2026-11-03', '2026-11-06', new Map([
    ['2026-11-03', true], ['2026-11-04', false], ['2026-11-05', true],
  ])));
  assert.ok(calendarStayError('2026-11-03', '2026-11-05', new Map([['2026-11-03', true]])));
});

test('admite cruzar de mes y el límite de 30 noches, pero no 31', () => {
  const start = '2026-12-20';
  const available = new Map(Array.from({ length: 31 }, (_, index) => [shiftCalendarDay(start, index), true]));
  assert.equal(calendarStayError(start, shiftCalendarDay(start, 30), available), null);
  assert.ok(calendarStayError(start, shiftCalendarDay(start, 31), available));
  assert.ok(calendarStayError(start, start, available));
});
