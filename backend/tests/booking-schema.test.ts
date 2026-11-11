import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { publicBookingSchema } from '../src/modules/booking/booking.schema.js';

const guest = { firstName: 'Ana', lastName: 'Pérez', phone: '1123456789' };

describe('email del formulario público de reserva', () => {
  it('permite omitirlo', () => {
    assert.equal(publicBookingSchema.parse(guest).email, undefined);
  });

  it('permite null y normaliza los valores vacíos', () => {
    for (const email of [null, '', '   ']) {
      assert.equal(publicBookingSchema.parse({ ...guest, email }).email, null);
    }
  });

  it('conserva un email válido sin espacios', () => {
    assert.equal(publicBookingSchema.parse({ ...guest, email: ' ana@example.com ' }).email, 'ana@example.com');
  });

  it('rechaza un email inválido si se completa', () => {
    assert.equal(publicBookingSchema.safeParse({ ...guest, email: 'correo-inválido' }).success, false);
  });
});
