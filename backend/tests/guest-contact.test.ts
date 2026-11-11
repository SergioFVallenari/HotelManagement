import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGuestSchema, updateGuestSchema } from '../src/modules/guests/guests.schema.js';
import { createReservationSchema, updateReservationSchema } from '../src/modules/reservations/reservations.schema.js';
import { reservationGuestWrite } from '../src/lib/guestIdentity.js';
import { resolveAiGuest } from '../src/modules/ai/aiReservation.guest.js';
import { reservationSystemPrompt } from '../src/modules/ai/aiReservation.prompt.js';

const name = { firstName: 'Juan', lastName: 'Pérez' };

test('huésped con solo nombre y apellido, contactos ausentes, vacíos o null', () => {
  assert.deepEqual(createGuestSchema.parse(name), name);
  for (const contact of [null, '', '  ']) {
    assert.deepEqual(createGuestSchema.parse({ ...name, email: contact, phone: contact }), { ...name, email: null, phone: null });
  }
});

test('los contactos opcionales se validan si se proporcionan', () => {
  assert.equal(createGuestSchema.safeParse({ ...name, email: 'no-es-email' }).success, false);
  assert.equal(createGuestSchema.safeParse({ ...name, phone: '12' }).success, false);
  assert.deepEqual(createGuestSchema.parse({ ...name, email: ' juan@example.com ', phone: ' 123456 ' }), { ...name, email: 'juan@example.com', phone: '123456' });
  assert.equal(createGuestSchema.safeParse({ firstName: ' ', lastName: ' ' }).success, false);
});

test('actualizar permite quitar y completar contactos, sin borrar campos omitidos', () => {
  assert.deepEqual(updateGuestSchema.parse({ email: '', phone: null }), { email: null, phone: null });
  assert.deepEqual(updateGuestSchema.parse({ phone: '123456' }), { phone: '123456' });
  assert.deepEqual(updateGuestSchema.parse({}), {});
});

test('crear y editar reservas permite huéspedes sin contacto', () => {
  const draft = { roomId: 1, guest: name, checkIn: '2026-12-02', checkOut: '2026-12-05', persons: 3 };
  assert.deepEqual(createReservationSchema.parse(draft).guest, name);
  assert.deepEqual(updateReservationSchema.parse({ guest: name }).guest, name);
});

test('sin email se crea ficha propia en lugar de buscar por null o por nombre', () => {
  for (const contact of [undefined, null]) {
    const write = reservationGuestWrite(7, { ...name, email: contact });
    assert.equal(write.kind, 'create');
    assert.equal(write.data.companyId, 7);
    assert.equal('where' in write, false);
  }
});

test('con email se mantiene la identidad por empresa y no se borra un teléfono existente por omitirlo', () => {
  const write = reservationGuestWrite(7, { ...name, email: 'juan@example.com', phone: null });
  assert.equal(write.kind, 'upsert');
  if (write.kind !== 'upsert') return;
  assert.deepEqual(write.where, { companyId_email: { companyId: 7, email: 'juan@example.com' } });
  assert.equal('phone' in write.update, false);
  const withPhone = reservationGuestWrite(8, { ...name, email: 'juan@example.com', phone: '123456' });
  assert.equal(withPhone.update?.phone, '123456');
  assert.equal(withPhone.create?.companyId, 8);
});

const guest = (id: number, email: string | null = null, phone: string | null = null) => ({ ...name, id, email, phone });
const noContact = { email: null, phone: null, guestId: null, newGuest: false };

test('IA prepara un huésped nuevo sin exigir contactos y reconoce una ficha única sin contacto', () => {
  assert.deepEqual(resolveAiGuest([], noContact), { guest: null, question: null });
  assert.equal(resolveAiGuest([guest(1)], noContact).guest?.id, 1);
  assert.match(reservationSystemPrompt('2026-11-05', {}), /La falta de teléfono o email nunca es motivo/);
});

test('IA distingue homónimos por ficha o permite crear uno nuevo sin contacto', () => {
  const guests = [guest(1), guest(2)];
  const ambiguous = resolveAiGuest(guests, noContact);
  assert.equal(ambiguous.guest, null);
  assert.match(ambiguous.question!, /Ficha 1/);
  assert.match(ambiguous.question!, /crear un huésped nuevo/);
  assert.equal(resolveAiGuest(guests, { ...noContact, guestId: 2 }).guest?.id, 2);
  assert.deepEqual(resolveAiGuest(guests, { ...noContact, newGuest: true }), { guest: null, question: null });
  assert.ok(resolveAiGuest(guests, { ...noContact, guestId: 99 }).question);
});

test('IA filtra contactos existentes sin fallar con null y no elige una ficha que no coincide', () => {
  const guests = [guest(1), guest(2, 'juan@example.com', '+54 11 1234')];
  assert.equal(resolveAiGuest(guests, { ...noContact, email: 'JUAN@example.com' }).guest?.id, 2);
  assert.equal(resolveAiGuest(guests, { ...noContact, phone: '54111234' }).guest?.id, 2);
  assert.ok(resolveAiGuest(guests, { ...noContact, email: 'juan@example.com', guestId: 1 }).question);
});
