import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAvailabilityMessage } from '../src/lib/availabilityShare.ts';
import { money } from '../src/lib/format.ts';
import type { PublicAvailability } from '../src/api/types.ts';

function quote(): Pick<PublicAvailability, 'hotel' | 'stay' | 'combination'> {
  return {
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
