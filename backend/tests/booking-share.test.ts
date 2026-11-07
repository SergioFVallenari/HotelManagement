import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildShareMessage, buildWhatsAppUrl, formatArs, normalizeWhatsAppPhone } from '../src/modules/booking/booking.share.js';
import { BOOKING_TOKEN_BYTES, generateBookingToken } from '../src/modules/booking/booking.token.js';
import { parseServiceLines } from '../src/modules/booking/booking.lines.js';

const stay = {
  hotelName: 'Hotel Principal',
  roomLabel: 'Doble 101',
  checkIn: '2026-11-01',
  checkOut: '2026-11-03',
  nights: 2,
  total: 100000,
  deposit: 20000,
  url: 'https://hotel.test/reserva/abc123',
};

describe('generateBookingToken', () => {
  it('genera tokens largos y url-safe', () => {
    const token = generateBookingToken();
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(token.length, Math.ceil((BOOKING_TOKEN_BYTES * 4) / 3));
    assert.equal(BOOKING_TOKEN_BYTES, 24);
  });

  it('no repite tokens', () => {
    const tokens = new Set(Array.from({ length: 200 }, () => generateBookingToken()));
    assert.equal(tokens.size, 200);
  });
});

describe('buildShareMessage', () => {
  it('arma el mensaje en español con totales y anticipo', () => {
    const message = buildShareMessage(stay);
    assert.match(message, /Hotel Principal/);
    assert.match(message, /Doble 101/);
    assert.match(message, /01\/11\/2026/);
    assert.match(message, /03\/11\/2026/);
    assert.match(message, /2 noches/);
    assert.match(message, /\$100\.000/);
    assert.match(message, /\$20\.000/);
    assert.ok(message.endsWith(stay.url));
  });

  it('usa singular con una sola noche', () => {
    const message = buildShareMessage({ ...stay, nights: 1 });
    assert.match(message, /1 noche\)/);
  });

  it('comparte las inclusiones y la frecuencia de los servicios congelados', () => {
    const message = buildShareMessage({ ...stay, services: [
      { name: 'Spa', chargeType: 'PACK', quantity: 1, lineTotal: 20000, description: 'Una sesión de 60 minutos para una persona.' },
      { name: 'Limpieza', chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3, quantity: 6, lineTotal: 30000, description: 'Baño y toallas.' },
    ] });
    assert.ok(message.includes('Servicios incluidos:'));
    assert.ok(message.includes('Spa × 1: $20.000'));
    assert.ok(message.includes('Incluye: Una sesión de 60 minutos para una persona.'));
    assert.ok(message.includes('cada 3 días, por habitación, sin incluir la salida'));
    assert.ok(message.includes(stay.url));
  });
});

describe('normalizeWhatsAppPhone', () => {
  it('deja el numero internacional tal cual', () => {
    assert.equal(normalizeWhatsAppPhone('5491123456789'), '5491123456789');
  });

  it('agrega el 54 y saca el 0 inicial de un numero local', () => {
    assert.equal(normalizeWhatsAppPhone('011 2345-6789'), '541123456789');
    assert.equal(normalizeWhatsAppPhone('11 2345 6789'), '541123456789');
  });

  it('devuelve vacio si no hay digitos', () => {
    assert.equal(normalizeWhatsAppPhone(''), '');
    assert.equal(normalizeWhatsAppPhone('sin numero'), '');
  });
});

describe('buildWhatsAppUrl', () => {
  it('codifica el mensaje y usa el telefono del hotel', () => {
    const url = buildWhatsAppUrl('Hola & chau', '+54 11 2345-6789');
    assert.equal(url, `https://wa.me/541123456789?text=${encodeURIComponent('Hola & chau')}`);
  });

  it('funciona sin telefono (el usuario elige el contacto)', () => {
    assert.equal(buildWhatsAppUrl('Hola'), `https://wa.me/?text=${encodeURIComponent('Hola')}`);
  });
});

describe('formatArs', () => {
  it('usa separador de miles y omite decimales en importes enteros', () => {
    assert.equal(formatArs(100000), new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(100000));
    assert.match(formatArs(1500), /^1\.?500$/);
  });
});

describe('parseServiceLines', () => {
  it('lee el snapshot guardado en el link', () => {
    const lines = parseServiceLines([
      { serviceId: 3, name: 'Desayuno', chargeType: 'PER_PERSON', quantity: 6, personsCovered: 2, unitPrice: 8000, lineTotal: 48000 },
    ]);
    assert.deepEqual(lines, [
      { serviceId: 3, name: 'Desayuno', description: null, intervalDays: null, chargeType: 'PER_PERSON', quantity: 6, personsCovered: 2, unitPrice: 8000, lineTotal: 48000 },
    ]);
  });

  it('ignora valores raros y completa los faltantes', () => {
    assert.deepEqual(parseServiceLines(null), []);
    assert.deepEqual(parseServiceLines('x'), []);
    assert.deepEqual(parseServiceLines([null, 3]), []);
    const [line] = parseServiceLines([{ serviceId: '5' }]);
    assert.equal(line.serviceId, 5);
    assert.equal(line.name, '');
    assert.equal(line.chargeType, 'PACK');
    assert.equal(line.personsCovered, null);
    assert.equal(line.unitPrice, 0);
  });

  it('normaliza Decimal serializado a numero', () => {
    const [line] = parseServiceLines([{ serviceId: 1, name: 'Cochera', chargeType: 'PER_DAY', quantity: 2, unitPrice: '1500.50', lineTotal: '3001.00' }]);
    assert.equal(line.unitPrice, 1500.5);
    assert.equal(line.lineTotal, 3001);
  });

  it('conserva descripción, frecuencia y cantidades congeladas sin depender del catálogo', () => {
    const snapshot = [{ serviceId: 4, name: 'Limpieza', description: 'Baño y recambio de toallas. No incluye sábanas.', intervalDays: 3, chargeType: 'PER_ROOM_INTERVAL', isExtraBed: false, quantity: 6, personsCovered: null, unitPrice: 5000, lineTotal: 30000 }];
    const lines = parseServiceLines(snapshot);
    snapshot[0].description = 'Otra descripción';
    snapshot[0].intervalDays = 1;
    assert.equal(lines[0].description, 'Baño y recambio de toallas. No incluye sábanas.');
    assert.equal(lines[0].intervalDays, 3);
    assert.equal(lines[0].quantity, 6);
    assert.equal(lines[0].lineTotal, 30000);
  });
});
