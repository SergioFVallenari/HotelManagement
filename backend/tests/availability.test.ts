import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocateAvailableRooms, type AvailableRoom } from '../src/lib/availability.js';
import { publicAvailabilityQuerySchema } from '../src/modules/booking/booking.schema.js';

const room = (capacity: number, price = 100, pricingMode: AvailableRoom['pricingMode'] = 'PER_NIGHT'): AvailableRoom => ({
  roomType: 'Estándar', capacity, price, pricingMode,
});

test('el tipo de habitación en la consulta es opcional y debe ser un identificador positivo entero', () => {
  const query = { checkIn: '2027-01-10', checkOut: '2027-01-12', persons: '2' };
  assert.equal(publicAvailabilityQuerySchema.parse(query).roomTypeId, undefined);
  assert.equal(publicAvailabilityQuerySchema.parse({ ...query, roomTypeId: '4' }).roomTypeId, 4);
  for (const roomTypeId of ['0', '-1', '1.5', 'doble', '', '9007199254740992']) {
    assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomTypeId }).success, false);
  }
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

test('respeta la distribución solicitada y conserva su orden', () => {
  const result = allocateAvailableRooms([room(2, 10), room(3, 100), room(4, 200)], 4, 2, 2, [3, 1]);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [3, 1]);
  assert.deepEqual(result?.rooms.map((item) => item.capacity), [3, 2]);
  assert.equal(result?.total, 220);
});

test('no sustituye una distribución imposible por otra que sí cabe', () => {
  assert.equal(allocateAvailableRooms([room(2), room(2)], 4, 1, 2, [3, 1]), null);
  assert.equal(allocateAvailableRooms([room(4)], 4, 1, 2, [2, 2]), null);
});

test('reasigna habitaciones para no consumir la única apta para el grupo más grande', () => {
  const result = allocateAvailableRooms([room(4, 10), room(2, 100)], 6, 1, 2, [2, 4]);
  assert.deepEqual(result?.rooms.map((item) => item.capacity), [2, 4]);
  assert.equal(result?.total, 110);
});

test('minimiza el precio con tarifas por persona y por habitación', () => {
  const result = allocateAvailableRooms([room(4, 10, 'PER_PERSON'), room(4, 25)], 4, 2, 2, [1, 3]);
  assert.deepEqual(result?.rooms.map((item) => item.total), [20, 50]);
  assert.equal(result?.total, 70);
});

test('rechaza distribuciones con sumas, cantidades o valores incorrectos', () => {
  for (const distribution of [[1, 1], [4], [0, 4], [-1, 5], [1.5, 2.5]]) {
    assert.equal(allocateAvailableRooms([room(4), room(4)], 4, 1, 2, distribution), null);
  }
});

test('valida y convierte la distribución recibida por query', () => {
  const query = { checkIn: '2026-11-01', checkOut: '2026-11-03', persons: '4', roomCount: '2', roomPersons: '3,1' };
  assert.deepEqual(publicAvailabilityQuerySchema.parse(query).roomPersons, [3, 1]);
  for (const roomPersons of ['2,1', '4', '0,4', '-1,5', '1.5,2.5', 'x,y', '']) {
    assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomPersons }).success, false);
  }
  assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomCount: undefined }).success, false);
  assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, roomPersons: undefined }).success, true);
});

test('las camas extra requieren aceptación explícita en la consulta', () => {
  const query = { checkIn: '2026-11-01', checkOut: '2026-11-03', persons: '5' };
  assert.equal(publicAvailabilityQuerySchema.parse(query).includeExtraBeds, false);
  assert.equal(publicAvailabilityQuerySchema.parse({ ...query, includeExtraBeds: 'false' }).includeExtraBeds, false);
  assert.equal(publicAvailabilityQuerySchema.parse({ ...query, includeExtraBeds: 'true' }).includeExtraBeds, true);
  for (const includeExtraBeds of ['1', 'yes', '', true, ['true']]) {
    assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, includeExtraBeds }).success, false);
  }
});

test('aceptar camas extra permite usar una habitación en lugar de dos', () => {
  const rooms = [{ ...room(4, 100), maxExtraBeds: 1, amenities: ['WiFi'] }, room(2, 80)];
  const service = { name: 'Cama extra', price: 20, chargeType: 'PER_DAY' as const };
  assert.equal(allocateAvailableRooms(rooms, 5, 2)?.roomCount, 2);
  const result = allocateAvailableRooms(rooms, 5, 2, undefined, undefined, service);
  assert.equal(result?.roomCount, 1);
  assert.equal(result?.total, 240);
  assert.equal(result?.rooms[0]?.persons, 5);
  assert.equal(result?.rooms[0]?.extraBeds, 1);
  assert.equal(result?.rooms[0]?.roomTotal, 200);
  assert.equal(result?.rooms[0]?.extraBedsTotal, 40);
  assert.deepEqual(result?.rooms[0]?.amenities, ['WiFi']);
});

test('sin aceptación solo usa capacidad base aunque la habitación admita camas extra', () => {
  assert.equal(allocateAvailableRooms([{ ...room(4), maxExtraBeds: 1 }], 5, 1), null);
});

test('la aceptación no permite superar el máximo de camas extra ni reutilizar habitaciones', () => {
  const service = { name: 'Cama extra', price: 20, chargeType: 'PER_DAY' as const };
  assert.equal(allocateAvailableRooms([{ ...room(4), maxExtraBeds: 1 }], 6, 1, undefined, undefined, service), null);
  assert.equal(allocateAvailableRooms([room(4)], 5, 1, undefined, undefined, service), null);
});

test('no agrega ni cobra camas extra cuando las personas caben en la capacidad base', () => {
  const result = allocateAvailableRooms([{ ...room(4), maxExtraBeds: 1 }], 4, 2, undefined, undefined, { name: 'Cama extra', price: 20, chargeType: 'PER_DAY' });
  assert.equal(result?.rooms[0]?.extraBeds, 0);
  assert.equal(result?.rooms[0]?.extraBedsTotal, 0);
  assert.equal(result?.total, 200);
});

test('cotiza solo las camas extra necesarias con PACK, PER_DAY y PER_PERSON', () => {
  const rooms = [{ ...room(4, 50, 'PER_PERSON'), maxExtraBeds: 2 }];
  for (const chargeType of ['PACK', 'PER_DAY', 'PER_PERSON'] as const) {
    const result = allocateAvailableRooms(rooms, 6, 3, undefined, undefined, { name: 'Cama extra', price: 30, chargeType });
    assert.equal(result?.rooms[0]?.roomTotal, 600);
    assert.equal(result?.rooms[0]?.extraBedsTotal, chargeType === 'PACK' ? 60 : 180);
    assert.equal(result?.total, chargeType === 'PACK' ? 660 : 780);
  }
});

test('con camas extra sigue respetando distribución por habitación y menor precio', () => {
  const rooms = [{ ...room(4, 100), maxExtraBeds: 1 }, room(2, 40), { ...room(4, 200), maxExtraBeds: 1 }];
  const service = { name: 'Cama extra', price: 10, chargeType: 'PER_DAY' as const };
  const result = allocateAvailableRooms(rooms, 7, 2, 2, [2, 5], service);
  assert.deepEqual(result?.rooms.map((item) => item.persons), [2, 5]);
  assert.deepEqual(result?.rooms.map((item) => item.extraBeds), [0, 1]);
  assert.equal(result?.total, 300);
  assert.equal(allocateAvailableRooms(rooms, 7, 2, 2, [1, 6], service), null);
});
