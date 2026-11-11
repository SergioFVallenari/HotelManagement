import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvailabilityMessage } from '../src/lib/availabilityShare.ts';
import { money } from '../src/lib/format.ts';
import type { PublicAvailability } from '../src/api/types.ts';
import { serviceQuantity } from '../src/lib/pricing.ts';
import { serviceRateLabel } from '../src/lib/services.ts';
import { selectAvailabilityOption } from '../src/lib/availabilitySelection.ts';

function quote(): Pick<PublicAvailability, 'hotel' | 'stay' | 'combination' | 'services'> {
  return {
    services: [],
    hotel: { name: 'Posada El Nómada', whatsapp: null, phone: null },
    stay: { checkIn: '2026-11-01', checkOut: '2026-11-04', nights: 3, persons: 5, includesExtraBeds: true },
    combination: {
      roomCount: 1, persons: 5, total: 330000, roomTotal: 300000, extraBeds: 1, extraBedsTotal: 30000,
      extraBedService: { name: 'CAMA EXTRA', price: 10000, chargeType: 'PER_DAY' },
      rooms: [{ roomType: 'Dormi', capacity: 4, persons: 5, extraBeds: 1, roomTotal: 300000, extraBedsTotal: 30000, total: 330000 }],
    },
  };
}

test('el mensaje distingue plazas base y cama extra y muestra importes de toda la estadía', () => {
  const message = buildAvailabilityMessage(quote());
  assert.ok(message.startsWith('¡Hola! Quisiera consultar por esta estadía en *Posada El Nómada*:'));
  assert.ok(message.includes('*Entrada:* 01/11/2026'));
  assert.ok(message.includes('*Salida:* 04/11/2026 · *3 noches*'));
  assert.ok(message.includes('*Huéspedes:* 5 personas'));
  assert.ok(message.includes('*1 habitación Dormi*\nPara 4 personas + 1 cama extra.'));
  assert.ok(!/\p{Extended_Pictographic}|\uFFFD/u.test(message));
  assert.ok(message.includes('*Importes por las 3 noches:*'));
  assert.ok(message.includes(`Habitación: ${money(300000)}`));
  assert.ok(message.includes(`Cama extra: ${money(30000)}`));
  assert.ok(message.includes(`*Total estimado: ${money(330000)}*`));
  assert.ok(message.endsWith('¿Me confirman la disponibilidad y cómo puedo reservar?'));
  assert.ok(!message.includes('Servicio:'));
  assert.ok(!message.includes('cama(s)'));
});

test('la consulta identifica la habitación real elegida junto a tipo, fechas, personas y servicios', () => {
  const result = quote();
  result.stay.roomType = 'Dormi';
  result.stay.room = { id: 8, number: '108', name: 'Vista al jardín', capacity: 4, maxExtraBeds: 1 };
  result.services = [{ serviceId: 2, name: 'Desayuno', chargeType: 'PER_PERSON', quantity: 15, unitPrice: 10, lineTotal: 150 }];
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*Habitación seleccionada:* 108 · Vista al jardín'));
  assert.ok(message.includes('*Tipo solicitado:* Dormi'));
  assert.ok(message.includes('*Entrada:* 01/11/2026'));
  assert.ok(message.includes('*Huéspedes:* 5 personas'));
  assert.ok(message.includes('Desayuno (5 personas × 3 noches)'));
  result.stay.room.name = null;
  assert.ok(buildAvailabilityMessage(result).includes('*Habitación seleccionada:* 108\n'));
});

test('omite el tipo solicitado cuando el alojamiento tiene un único tipo habilitado', () => {
  const result = quote();
  result.stay.roomType = 'Dormi';
  result.stay.room = { id: 2, number: '2', name: 'Dormi 2', capacity: 4, maxExtraBeds: 1 };
  const message = buildAvailabilityMessage(result, 1);
  assert.ok(!message.includes('*Tipo solicitado:*'));
  assert.ok(message.includes('*Habitación seleccionada:* 2 · Dormi 2'));
  assert.ok(message.includes('*1 habitación Dormi*'));
  assert.ok(buildAvailabilityMessage(result, 2).includes('*Tipo solicitado:* Dormi'));
});

test('usa singular para una persona y una noche sin mencionar camas extra innecesarias', () => {
  const result = quote();
  result.stay = { ...result.stay, nights: 1, persons: 1, checkOut: '2026-11-02' };
  const combination = result.combination!;
  combination.extraBeds = 0;
  combination.extraBedsTotal = 0;
  combination.roomTotal = combination.total = 100000;
  combination.rooms[0] = { ...combination.rooms[0], persons: 1, extraBeds: 0 };
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*1 noche*'));
  assert.ok(message.includes('*Huéspedes:* 1 persona'));
  assert.ok(message.includes('Para 1 persona.'));
  assert.ok(message.includes('*Importes por la noche:*'));
  assert.ok(!message.includes('cama extra'));
});

test('detalla cada habitación del grupo y pluraliza las camas extra', () => {
  const result = quote();
  const combination = result.combination!;
  combination.roomCount = 2;
  combination.extraBeds = 2;
  combination.rooms = [
    { ...combination.rooms[0], persons: 6, extraBeds: 2 },
    { ...combination.rooms[0], roomType: 'Doble', persons: 2, extraBeds: 0 },
  ];
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*2 habitaciones*'));
  assert.ok(message.includes('Habitación 1: Dormi\nPara 4 personas + 2 camas extra.'));
  assert.ok(message.includes('Habitación 2: Doble\nPara 2 personas.'));
  assert.ok(message.includes(`Camas extra: ${money(combination.extraBedsTotal)}`));
});

test('si no hay propuesta no inventa habitaciones ni importes', () => {
  const result = quote();
  result.combination = null;
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*Huéspedes:* 5 personas'));
  assert.ok(!message.includes('Importes'));
  assert.ok(!message.includes('Total estimado'));
});

test('el mensaje conserva el tipo solicitado incluso si no hay habitaciones disponibles', () => {
  const result = quote();
  result.stay.roomType = 'Suite Superior';
  assert.ok(buildAvailabilityMessage(result).includes('*Tipo solicitado:* Suite Superior'));
  result.combination = null;
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*Tipo solicitado:* Suite Superior'));
  assert.ok(!message.includes('Total estimado'));
});

test('incluye desayuno para todos los huéspedes, servicios por noche y packs junto al total con camas extra', () => {
  const result = quote();
  result.services = [
    { serviceId: 1, name: 'Desayuno', chargeType: 'PER_PERSON', quantity: 15, unitPrice: 1000, lineTotal: 15000 },
    { serviceId: 2, name: 'Estacionamiento', chargeType: 'PER_DAY', quantity: 3, unitPrice: 2000, lineTotal: 6000 },
    { serviceId: 3, name: 'Vianda', chargeType: 'PACK', quantity: 2, unitPrice: 3000, lineTotal: 6000 },
  ];
  result.combination!.total += 27000;
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes(`Desayuno (5 personas × 3 noches): ${money(15000)}`));
  assert.ok(message.includes(`Estacionamiento (3 noches): ${money(6000)}`));
  assert.ok(message.includes(`Vianda (2 packs): ${money(6000)}`));
  assert.ok(message.includes(`*Total estimado: ${money(357000)}*`));
  assert.equal(message.split('Desayuno').length - 1, 1);
});

test('conserva los servicios solicitados sin prometer disponibilidad cuando no hay combinación', () => {
  const result = quote();
  result.combination = null;
  result.services = [{ serviceId: 1, name: 'Desayuno', chargeType: 'PER_PERSON', quantity: 15, unitPrice: 1000, lineTotal: 15000 }];
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('*Servicios solicitados:*'));
  assert.ok(message.includes('Desayuno'));
  assert.ok(!message.includes('Total estimado'));
});

test('el mensaje explica la limpieza periódica por habitación y conserva la descripción del spa', () => {
  const result = quote();
  result.stay.nights = 10;
  result.combination!.roomCount = 2;
  result.services = [
    { serviceId: 4, name: 'Limpieza', description: 'Incluye baño y toallas. No incluye sábanas.', chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3, quantity: 6, unitPrice: 5000, lineTotal: 30000 },
    { serviceId: 5, name: 'Spa', description: 'Una sesión de 60 minutos para una persona. Coordinar horario.', chargeType: 'PACK', quantity: 1, unitPrice: 20000, lineTotal: 20000 },
  ];
  result.combination!.total += 50000;
  const message = buildAvailabilityMessage(result);
  assert.ok(message.includes('Cada 3 días: 2 habitaciones × 3 intervenciones, sin incluir el día de salida'));
  assert.ok(message.includes('Incluye: Incluye baño y toallas. No incluye sábanas.'));
  assert.ok(message.includes('Spa (1 pack)'));
  assert.ok(message.includes('Una sesión de 60 minutos para una persona. Coordinar horario.'));
  assert.ok(message.includes(`*Total estimado: ${money(380000)}*`));
});

test('la estimación interna usa frecuencia por habitación y excluye el check-out', () => {
  assert.equal(serviceQuantity('PER_ROOM_INTERVAL', { persons: 4, extraBeds: 0, nights: 10, roomCount: 2 }, 999, false, 3), 6);
  assert.equal(serviceQuantity('PER_ROOM_INTERVAL', { persons: 4, extraBeds: 0, nights: 6, roomCount: 2 }, undefined, false, 3), 2);
  assert.equal(serviceQuantity('PER_ROOM_INTERVAL', { persons: 4, extraBeds: 0, nights: 3, roomCount: 2 }, undefined, false, 3), 0);
  assert.equal(serviceQuantity('PER_ROOM_INTERVAL', { persons: 4, extraBeds: 0, nights: 10, roomCount: 0 }, undefined, false, 3), 0);
  assert.equal(serviceQuantity('PER_PERSON', { persons: 5, extraBeds: 1, nights: 3 }, 5), 15);
  assert.ok(serviceRateLabel({ chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3, price: 5000 }).includes('por habitación e intervención · cada 3 días'));
});

test('elegir una suite desde cualquier tipo cambia la cotización y WhatsApp sin perder las alternativas', () => {
  const original = quote();
  const dormi = original.combination!;
  const suite = { ...dormi, total: 450000, roomTotal: 450000, extraBeds: 0, extraBedsTotal: 0, extraBedService: null, rooms: [{ ...dormi.rooms[0], roomType: 'Suite Superior', capacity: 5, extraBeds: 0, roomTotal: 450000, extraBedsTotal: 0, total: 450000 }] };
  const result: PublicAvailability = {
    ...original, availableRoomCount: 2, availableRoomCapacity: 5, servicesTotal: 0,
    options: [
      { roomType: 'Dormi', available: 1, capacity: 4, fromPrice: 100000, roomCount: 1, total: dormi.total, roomTotal: dormi.roomTotal, services: [], servicesTotal: 0, combination: dormi },
      { roomType: 'Suite Superior', available: 1, capacity: 5, fromPrice: 150000, roomCount: 1, total: suite.total, roomTotal: suite.roomTotal, services: [], servicesTotal: 0, combination: suite },
    ],
  };
  const selected = selectAvailabilityOption(result, 'Suite Superior');
  assert.equal(selected.stay.roomType, 'Suite Superior');
  assert.equal(selected.combination?.total, 450000);
  assert.equal(selected.combination?.extraBeds, 0);
  const message = buildAvailabilityMessage(selected);
  assert.ok(message.includes('*1 habitación Suite Superior*'));
  assert.ok(message.includes(`*Total estimado: ${money(450000)}*`));
  assert.ok(!message.includes('Dormi'));
  assert.ok(!message.includes('Cama extra:'));
  assert.equal(selected.options.length, 2);
  assert.equal(result.combination?.total, 330000);
  assert.equal(selectAvailabilityOption(selected, 'Dormi').combination?.total, 330000);
  assert.throws(() => selectAvailabilityOption(result, 'Inexistente'), /no está disponible/);
});

test('al elegir otra distribución se usan sus cantidades de limpieza y su total completo', () => {
  const original = quote();
  const room = original.combination!.rooms[0];
  const combination = { ...original.combination!, roomCount: 2, total: 330000, extraBeds: 0, extraBedsTotal: 0, extraBedService: null, rooms: [
    { ...room, persons: 2, extraBeds: 0, roomTotal: 150000, extraBedsTotal: 0, total: 150000 },
    { ...room, persons: 3, extraBeds: 0, roomTotal: 150000, extraBedsTotal: 0, total: 150000 },
  ] };
  const services: PublicAvailability['services'] = [{ serviceId: 4, name: 'Limpieza', chargeType: 'PER_ROOM_INTERVAL', intervalDays: 1, quantity: 4, unitPrice: 7500, lineTotal: 30000 }];
  const result: PublicAvailability = { ...original, availableRoomCount: 3, availableRoomCapacity: 4, servicesTotal: 0, options: [
    { roomType: 'Dormi', available: 2, capacity: 4, fromPrice: 50000, roomCount: 2, total: 330000, roomTotal: 300000, combination, services, servicesTotal: 30000 },
  ] };
  const selected = selectAvailabilityOption(result, 'Dormi');
  assert.deepEqual(selected.services, services);
  assert.equal(selected.servicesTotal, 30000);
  assert.equal(selected.combination?.total, 330000);
  assert.ok(buildAvailabilityMessage(selected).includes(`Limpieza (Cada 1 día: 2 habitaciones × 2 intervenciones, sin incluir el día de salida): ${money(30000)}`));
});
