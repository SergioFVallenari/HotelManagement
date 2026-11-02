import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteAvailabilityChoices } from '../src/lib/availabilityChoices.js';
import { publicAvailabilityQuerySchema } from '../src/modules/booking/booking.schema.js';

const room = (typeId: number, roomType: string, capacity: number, price: number, maxExtraBeds = 0) => ({ typeId, roomType, capacity, price, maxExtraBeds, pricingMode: 'PER_NIGHT' as const });

test('cada alternativa tiene su propia cotización y no reutiliza la habitación más barata de otro tipo', () => {
  const quote = quoteAvailabilityChoices({ rooms: [room(1, 'Doble', 2, 100), room(2, 'Suite', 2, 250)], persons: 2, nights: 3, publicServices: [], services: [] });
  assert.equal(quote.combination?.total, 300);
  assert.equal(quote.options.length, 2);
  const suite = quote.options.find((option) => option.roomType === 'Suite')!;
  assert.equal(suite.total, 750);
  assert.equal(suite.combination?.rooms[0]?.roomType, 'Suite');
  assert.equal(suite.combination?.roomTotal, 750);
  assert.equal(suite.combination?.total, suite.total);
});

test('permite elegir categorías para grupos y calcula limpieza según las habitaciones de cada alternativa', () => {
  const quote = quoteAvailabilityChoices({
    rooms: [room(1, 'Doble', 2, 100), room(1, 'Doble', 2, 100), room(2, 'Familiar', 4, 300)],
    persons: 4, nights: 10,
    publicServices: [{ id: 1, name: 'Limpieza', intervalDays: 3, chargeType: 'PER_ROOM_INTERVAL', price: 10 }],
    services: [{ serviceId: 1 }],
  });
  const double = quote.options.find((option) => option.roomType === 'Doble')!;
  const family = quote.options.find((option) => option.roomType === 'Familiar')!;
  assert.equal(double.roomCount, 2);
  assert.equal(double.services[0]?.quantity, 6);
  assert.equal(double.total, 2060);
  assert.equal(family.roomCount, 1);
  assert.equal(family.services[0]?.quantity, 3);
  assert.equal(family.total, 3030);
  assert.equal(quote.combination?.roomCount, 1);
});

test('las alternativas respetan aceptación de camas extra y muestran su propio cargo', () => {
  const input = { rooms: [room(1, 'Doble', 2, 100, 1), room(2, 'Familiar', 4, 300)], persons: 3, nights: 2, publicServices: [], services: [] };
  assert.deepEqual(quoteAvailabilityChoices(input).options.map((option) => option.roomType), ['Familiar']);
  const quote = quoteAvailabilityChoices({ ...input, extraBedService: { name: 'Cama extra', chargeType: 'PER_DAY', price: 20 } });
  const double = quote.options.find((option) => option.roomType === 'Doble')!;
  assert.equal(double.combination?.extraBeds, 1);
  assert.equal(double.combination?.extraBedsTotal, 40);
  assert.equal(double.total, 240);
  assert.equal(double.combination?.rooms[0]?.persons, 3);
});

test('cada alternativa respeta la distribución y cantidad exacta de habitaciones solicitadas', () => {
  const quote = quoteAvailabilityChoices({ rooms: [room(1, 'Doble', 2, 100), room(1, 'Doble', 2, 100), room(2, 'Triple', 3, 200), room(2, 'Triple', 3, 200)], persons: 4, nights: 2, roomCount: 2, roomPersons: [1, 3], publicServices: [], services: [] });
  assert.deepEqual(quote.options.map((option) => option.roomType), ['Triple']);
  assert.deepEqual(quote.options[0]?.combination?.rooms.map((line) => line.persons), [1, 3]);
});

test('sin disponibilidad no inventa alternativas', () => {
  const quote = quoteAvailabilityChoices({ rooms: [], persons: 2, nights: 2, publicServices: [], services: [] });
  assert.equal(quote.combination, null);
  assert.deepEqual(quote.options, []);
});

test('cotiza la habitación elegida aunque exista otra más barata del mismo tipo', () => {
  const quote = quoteAvailabilityChoices({
    rooms: [{ ...room(1, 'Doble', 2, 100), id: 1 }, { ...room(1, 'Doble', 2, 250, 1), id: 2 }],
    selectedRoomId: 2, persons: 3, nights: 2,
    extraBedService: { name: 'Cama extra', chargeType: 'PER_DAY', price: 20 },
    publicServices: [{ id: 1, name: 'Desayuno', chargeType: 'PER_PERSON', price: 10 }], services: [{ serviceId: 1 }],
  });
  assert.equal(quote.combination?.roomCount, 1);
  assert.equal(quote.combination?.roomTotal, 500);
  assert.equal(quote.combination?.extraBedsTotal, 40);
  assert.equal(quote.servicesTotal, 60);
  assert.equal(quote.combination?.total, 600);
  assert.deepEqual(quote.options, []);
});

test('no sustituye una habitación seleccionada no disponible ni combina otras por falta de capacidad', () => {
  const input = { rooms: [{ ...room(1, 'Doble', 2, 100), id: 1 }], persons: 2, nights: 2, publicServices: [], services: [] };
  assert.equal(quoteAvailabilityChoices({ ...input, selectedRoomId: 2 }).combination, null);
  assert.equal(quoteAvailabilityChoices({ ...input, selectedRoomId: 1, persons: 3 }).combination, null);
});

test('valida la selección individual y mantiene el formato de búsqueda legado', () => {
  const query = { checkIn: '2026-11-03', checkOut: '2026-11-05', persons: '2' };
  assert.equal(publicAvailabilityQuerySchema.parse({ ...query, roomId: '12' }).roomId, 12);
  assert.equal(publicAvailabilityQuerySchema.safeParse(query).success, true);
  for (const roomId of ['0', '-1', '1.5', 'texto']) assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomId }).success, false);
  assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomId: '12', roomCount: '2' }).success, false);
});
