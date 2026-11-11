import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { selectAiRooms } from '../src/modules/ai/aiReservation.selection.js';
import { reservationIntentSchema, reservationChatSchema, reservationIntentResponseSchema } from '../src/modules/ai/aiReservation.schema.js';
import { reservationSystemPrompt } from '../src/modules/ai/aiReservation.prompt.js';
import { signReservationProposal, verifyReservationProposal } from '../src/modules/ai/aiReservation.token.js';
import { updateAiSettingsSchema } from '../src/modules/ai/ai.schema.js';

test('habilita reservas independientemente del asistente de mensajes', () => {
  const settings = updateAiSettingsSchema.parse({ enabled: false, autoReply: false, reservationAssistantEnabled: true });
  assert.equal(settings.reservationAssistantEnabled, true);
  assert.equal(settings.enabled, false);
});

test('permite deshabilitar reservas y no impone un valor a clientes anteriores', () => {
  assert.equal(updateAiSettingsSchema.parse({ enabled: true, autoReply: true, reservationAssistantEnabled: false }).reservationAssistantEnabled, false);
  assert.equal(updateAiSettingsSchema.parse({ enabled: true, autoReply: true }).reservationAssistantEnabled, undefined);
  assert.equal(updateAiSettingsSchema.safeParse({ enabled: true, autoReply: true, reservationAssistantEnabled: 'true' }).success, false);
});

const room = (id: number, capacity: number, price = 100) => ({ id, number: String(id), typeName: 'Estándar', capacity, maxExtraBeds: 1, price, pricingMode: 'PER_NIGHT' as const });
const request = (persons: number, extraBeds = 0) => ({ number: null, type: null, persons, extraBeds });

test('una sola habitación para tres sin especificar tipo', () => {
  const selected = selectAiRooms([request(3)], [room(1, 2), room(2, 3)], 3);
  assert.deepEqual(selected?.map((r) => r.id), [2]);
});

test('no sustituye una habitación por dos ni agrega camas extras implícitas', () => {
  assert.equal(selectAiRooms([request(3)], [room(1, 2), room(2, 2)], 3), null);
});

test('propone la habitación compatible de menor precio', () => {
  assert.equal(selectAiRooms([request(3)], [room(1, 3, 200), room(2, 4, 100)], 3)?.[0]?.id, 2);
});

test('respeta número y tipo sin sustituir preferencias', () => {
  assert.equal(selectAiRooms([{ ...request(2), number: '9' }], [room(1, 3)], 3), null);
  assert.equal(selectAiRooms([{ ...request(2), type: 'Suite' }], [room(1, 3)], 3), null);
  assert.equal(selectAiRooms([{ ...request(2), type: 'estandar' }], [room(1, 3)], 3)?.[0]?.id, 1);
});

test('distribuye grupos sin reutilizar habitaciones ni bloquear la habitación necesaria para otro grupo', () => {
  const selected = selectAiRooms([request(2), request(4)], [room(1, 4, 50), room(2, 2, 100)], 3);
  assert.deepEqual(selected?.map((r) => r.id), [2, 1]);
  assert.equal(selectAiRooms([request(2), request(2)], [room(1, 4)], 3), null);
});

test('camas extras explícitas respetan capacidad base y máximo', () => {
  assert.ok(selectAiRooms([request(3, 1)], [room(1, 2)], 3));
  assert.equal(selectAiRooms([request(4, 2)], [room(1, 2)], 3), null);
  assert.equal(selectAiRooms([request(2, 1)], [room(1, 2)], 3), null);
});

test('interpreta precios por persona para elegir habitación', () => {
  const selected = selectAiRooms([request(3)], [{ ...room(1, 3, 90), pricingMode: 'PER_PERSON' as const }, room(2, 3, 200)], 2);
  assert.equal(selected?.[0]?.id, 2);
});

const intent = { question: null, checkIn: null, checkOut: null, firstName: 'Juan', lastName: 'Pérez', phone: null, email: null, rooms: [request(3)], services: [], notes: null };

test('permite fechas faltantes pero rechaza fechas inexistentes y cantidades inválidas', () => {
  assert.ok(reservationIntentSchema.safeParse(intent).success);
  assert.equal(reservationIntentSchema.safeParse({ ...intent, checkIn: '2026-02-30' }).success, false);
  assert.equal(reservationIntentSchema.safeParse({ ...intent, rooms: [request(0)] }).success, false);
});

test('el esquema de Gemini conserva los campos del contrato validado', () => {
  assert.deepEqual(Object.keys(reservationIntentResponseSchema.properties).sort(), Object.keys(reservationIntentSchema.shape).sort());
  assert.deepEqual([...reservationIntentResponseSchema.required].sort(), Object.keys(reservationIntentSchema.shape).sort());
  assert.equal(reservationIntentResponseSchema.properties.checkIn.nullable, true);
});

test('limita el historial y exige un pedido del usuario al final', () => {
  assert.ok(reservationChatSchema.safeParse({ messages: [{ role: 'user', text: 'Reservame del 2 al 5' }] }).success);
  assert.equal(reservationChatSchema.safeParse({ messages: [{ role: 'model', text: 'Confirmado' }] }).success, false);
  assert.equal(reservationChatSchema.safeParse({ messages: Array(31).fill({ role: 'user', text: 'Hola' }) }).success, false);
});

test('prompt independiente de canales, sin inventar mes ni contactos', () => {
  const prompt = reservationSystemPrompt('2026-11-05', {});
  assert.match(prompt, /2026-11-05/);
  assert.match(prompt, /Nunca asumas el mes/);
  assert.match(prompt, /no inventes contactos/);
});

test('propuesta firmada conserva usuario y empresa, vence a los diez minutos y no sirve como sesión', () => {
  const token = signReservationProposal({ companyId: 1, userId: 2, code: 'RSV-IA-test' }, 'test-secret');
  const payload = verifyReservationProposal(token, 'test-secret');
  assert.equal(payload.companyId, 1);
  assert.equal(payload.userId, 2);
  assert.equal(payload.exp! - payload.iat!, 600);
  assert.throws(() => jwt.verify(token, 'test-secret'));
  assert.throws(() => verifyReservationProposal(token, 'otra-clave'));
  assert.throws(() => verifyReservationProposal(signReservationProposal({ iat: Math.floor(Date.now() / 1000) - 601 }, 'test-secret'), 'test-secret'));
  assert.throws(() => verifyReservationProposal(jwt.sign({ companyId: 1, userId: 2 }, 'test-secret'), 'test-secret'));
  const [header, body, signature] = token.split('.');
  const modified = Buffer.from(JSON.stringify({ ...payload, companyId: 99 })).toString('base64url');
  assert.notEqual(body, modified);
  assert.throws(() => verifyReservationProposal(`${header}.${modified}.${signature}`, 'test-secret'));
});
