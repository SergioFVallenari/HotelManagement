import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserTurns } from '../src/modules/ai/ai.prompt.js';

const TODAY = { date: '2026-10-21', weekday: 'mié' };

test('buildSystemPrompt incluye hotel, servicios e instrucciones', () => {
  const prompt = buildSystemPrompt({
    hotelName: 'Hotel Principal',
    today: TODAY,
    instructions: 'No ofrecer late check-out los domingos.',
    services: [{ name: 'Desayuno', price: 2500, chargeType: 'PER_PERSON' }],
    rooms: [{ name: 'Dormi 1', typeName: 'Doble', capacity: 2, price: 50000, amenities: ['wifi'] }],
    availability: [],
  });

  assert.match(prompt, /Hotel Principal/);
  assert.match(prompt, /Hoy es mié 2026-10-21/);
  assert.match(prompt, /Desayuno: \$2500 por persona\/noche/);
  assert.match(prompt, /No ofrecer late check-out los domingos\./);
  assert.match(prompt, /"action": "auto" \| "suggest"/);
});

test('buildSystemPrompt sin servicios ni instrucciones no agrega esas secciones', () => {
  const prompt = buildSystemPrompt({
    hotelName: 'Hotel Sol',
    today: TODAY,
    instructions: null,
    services: [],
    rooms: [],
    availability: [],
  });

  assert.match(prompt, /Hotel Sol/);
  assert.doesNotMatch(prompt, /Servicios del hotel/);
  assert.doesNotMatch(prompt, /Instrucciones del hotel/);
});

test('buildSystemPrompt etiqueta los tipos de cargo conocidos', () => {
  const prompt = buildSystemPrompt({
    hotelName: 'Hotel X',
    today: TODAY,
    instructions: null,
    services: [
      { name: 'Cena', price: 9000, chargeType: 'PER_DAY' },
      { name: 'Tours', price: 15000, chargeType: 'PACK' },
      { name: 'Misterio', price: 100, chargeType: 'OTRO' },
    ],
    rooms: [
      { name: 'Dormi 1', typeName: 'Doble', capacity: 2, price: 50000, amenities: ['wifi'] },
      { name: 'Dormi 2', typeName: 'Doble', capacity: 3, price: 60000, amenities: ['wifi, ropa de cama'] },
      { name: 'Dormi 3', typeName: 'Triple', capacity: 4, price: 70000, amenities: ['wifi, aire acondicionado'] },
    ],
    availability: [],
  });

  assert.match(prompt, /Cena: \$9000 por día/);
  assert.match(prompt, /Tours: \$15000 por unidad/);
  assert.match(prompt, /Misterio: \$100 OTRO/);
});

test('buildSystemPrompt incluye la disponibilidad real por noche', () => {
  const prompt = buildSystemPrompt({
    hotelName: 'Hotel X',
    today: TODAY,
    instructions: null,
    services: [],
    rooms: [{ name: 'Dormi 1', typeName: 'Doble', capacity: 3, price: 50000, amenities: [] }],
    availability: [
      {
        date: '2026-10-23',
        weekday: 'vie',
        types: [
          { name: 'Doble', capacity: 3, free: 2, total: 4 },
          { name: 'Simple', capacity: 1, free: 0, total: 1 },
        ],
      },
    ],
  });

  assert.match(prompt, /Disponibilidad real por noche/);
  assert.match(prompt, /- vie 2026-10-23: Doble 2\/4 \(hasta 3 personas\), Simple 0\/1 \(hasta 1 personas\)/);
  assert.match(prompt, /la noche del check-in cuenta/);
  assert.match(prompt, /"suggest" y no inventes disponibilidad/);
});

test('buildSystemPrompt sin disponibilidad no agrega la sección', () => {
  const prompt = buildSystemPrompt({
    hotelName: 'Hotel X',
    today: TODAY,
    instructions: null,
    services: [],
    rooms: [],
    availability: [],
  });

  assert.doesNotMatch(prompt, /Disponibilidad real por noche/);
});

test('buildUserTurns ordena cronológicamente y mapea direcciones', () => {
  const turns = buildUserTurns([
    { direction: 'OUT', text: 'Hola!', sentAt: '2026-10-19T15:00:00Z' },
    { direction: 'IN', text: '¿Tienen lugar?', sentAt: '2026-10-19T14:00:00Z' },
  ]);

  assert.equal(turns.length, 2);
  assert.match(turns[0].text, /^El huésped: ¿Tienen lugar\?$/);
  assert.match(turns[1].text, /^El hotel: Hola!$/);
});

test('buildUserTurns se queda con los últimos 20 mensajes', () => {
  const history = Array.from({ length: 25 }, (_, index) => ({
    direction: 'IN' as const,
    text: `msg-${index}`,
    sentAt: new Date(Date.UTC(2026, 9, 19, 12, 0, index)),
  }));

  const turns = buildUserTurns(history);

  assert.equal(turns.length, 20);
  assert.match(turns[0].text, /msg-5$/);
  assert.match(turns[19].text, /msg-24$/);
});

test('buildUserTurns marca los mensajes sin texto como adjunto', () => {
  const turns = buildUserTurns([{ direction: 'IN', text: null, sentAt: '2026-10-19T12:00:00Z' }]);

  assert.equal(turns[0].text, 'El huésped: [adjunto sin texto]');
});

test('buildUserTurns con historial vacío devuelve nada', () => {
  assert.deepEqual(buildUserTurns([]), []);
});
