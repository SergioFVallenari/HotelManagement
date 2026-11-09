import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailSchema, guestContactSchema, hotelContactSchema, phoneSchema, publicBookingContactSchema, validateContact } from '../src/lib/contactValidation.ts';

test('email válido sin espacios y rechazo de formatos inválidos', () => {
  assert.equal(validateContact(emailSchema, ' ana@example.com '), 'ana@example.com');
  for (const email of ['', 'ana', 'ana@', 'ana@example', 'ana @example.com', `${'a'.repeat(255)}@example.com`]) {
    assert.equal(emailSchema.safeParse(email).success, false);
  }
  assert.throws(() => validateContact(emailSchema, 'incorrecto'), /Ingresá un email válido/);
});

test('teléfonos locales e internacionales con separadores', () => {
  for (const phone of ['1123456789', '+54 (11) 1234-5678', '123.4567', '+1 202 555 0123']) {
    assert.equal(phoneSchema.safeParse(phone).success, true);
  }
  for (const phone of ['', '123456', '1234567890123456', 'llamar al 1123456789', '11+23456789', '-------']) {
    assert.equal(phoneSchema.safeParse(phone).success, false);
  }
});

test('contactos opcionales vacíos se envían como null', () => {
  for (const value of ['', '  ', null, undefined]) {
    assert.deepEqual(validateContact(guestContactSchema, { email: value, phone: value }), { email: null, phone: null });
  }
  assert.deepEqual(validateContact(hotelContactSchema, { phone: '', whatsapp: '' }), { phone: null, whatsapp: null });
});

test('la reserva pública exige teléfono pero no email', () => {
  assert.deepEqual(validateContact(publicBookingContactSchema, { phone: '1123456789', email: '' }), { phone: '1123456789', email: null });
  assert.equal(publicBookingContactSchema.safeParse({ phone: '', email: '' }).success, false);
  assert.equal(publicBookingContactSchema.safeParse({ phone: '1123456789', email: 'incorrecto' }).success, false);
  assert.throws(() => validateContact(guestContactSchema, { phone: '', email: 'incorrecto' }), /Ingresá un email válido/);
});

test('el email del huésped respeta el máximo de 200 caracteres', () => {
  const email = `${'a'.repeat(60)}@${'b'.repeat(60)}.${'c'.repeat(60)}.example.com`;
  assert.equal(guestContactSchema.safeParse({ email, phone: '' }).success, true);
  assert.equal(guestContactSchema.safeParse({ email: email.replace('.example.com', '.exampleexampleexample.com'), phone: '' }).success, false);
});
