import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRecipientSchema, recipientIdSchema, updateRecipientSchema } from '../src/modules/recipients/recipients.schema.js';

test('normaliza nombre y email y activa el destinatario por defecto', () => {
  assert.deepEqual(createRecipientSchema.parse({ name: ' Recepción ', email: ' ADMIN@HOTEL.COM ' }), {
    name: 'Recepción', email: 'admin@hotel.com', enabled: true,
  });
});

test('permite crear desactivado y cambiar solo el switch sin activar por defecto otros cambios', () => {
  assert.equal(createRecipientSchema.parse({ name: 'Titular', email: 'titular@hotel.com', enabled: false }).enabled, false);
  assert.deepEqual(updateRecipientSchema.parse({ enabled: false }), { enabled: false });
  assert.deepEqual(updateRecipientSchema.parse({ name: ' Otro nombre ' }), { name: 'Otro nombre' });
  assert.deepEqual(updateRecipientSchema.parse({ email: ' OTRO@HOTEL.COM ' }), { email: 'otro@hotel.com' });
});

test('rechaza campos de tenant, identificadores, datos inválidos y actualizaciones vacías', () => {
  const valid = { name: 'Recepción', email: 'recepcion@hotel.com' };
  for (const extra of [{ companyId: 2 }, { id: 5 }, { createdAt: '2026-11-05' }]) {
    assert.equal(createRecipientSchema.safeParse({ ...valid, ...extra }).success, false);
    assert.equal(updateRecipientSchema.safeParse(extra).success, false);
  }
  for (const invalid of [{ name: ' ' }, { email: 'sin-email' }, { email: 'a'.repeat(255) }, { enabled: 'false' }, { name: 'a'.repeat(256) }]) {
    assert.equal(createRecipientSchema.safeParse({ ...valid, ...invalid }).success, false);
    assert.equal(updateRecipientSchema.safeParse(invalid).success, false);
  }
  assert.equal(updateRecipientSchema.safeParse({}).success, false);
});

test('los identificadores inválidos se rechazan antes de consultar la base', () => {
  assert.deepEqual(recipientIdSchema.parse({ id: '12' }), { id: 12 });
  for (const id of ['abc', '-1', '0', '1.5', '', undefined, ['1', '2']]) {
    assert.equal(recipientIdSchema.safeParse({ id }).success, false);
  }
});
