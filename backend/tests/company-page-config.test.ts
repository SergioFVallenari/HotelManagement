import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicPageConfigSchema } from '../src/modules/companies/companies.schema.js';

const validConfig = {
  bookingTheme: {
    primary: '#263D32',
    secondary: '#815437',
    accent: '#BF683D',
    text: '#242424',
    background: '#F3EBDD',
  },
};

test('la configuración pública acepta una paleta HEX completa', () => {
  assert.deepEqual(publicPageConfigSchema.parse(validConfig), validConfig);
});

test('el fondo secundario es opcional para paletas existentes y valida su formato HEX', () => {
  const bookingTheme = { ...validConfig.bookingTheme, surface: '#FFFFFF' };
  assert.deepEqual(publicPageConfigSchema.parse({ bookingTheme }).bookingTheme, bookingTheme);
  assert.equal(publicPageConfigSchema.safeParse({
    bookingTheme: { ...bookingTheme, surface: 'white' },
  }).success, false);
});

test('el máximo público admite enteros positivos o modo automático', () => {
  for (const maxAvailabilityPersons of [1, 32, null]) {
    assert.equal(publicPageConfigSchema.safeParse({ ...validConfig, maxAvailabilityPersons }).success, true);
  }
  for (const maxAvailabilityPersons of [0, -1, 1.5, '20']) {
    assert.equal(publicPageConfigSchema.safeParse({ ...validConfig, maxAvailabilityPersons }).success, false);
  }
});

test('la configuración pública rechaza colores inválidos o claves inesperadas', () => {
  assert.equal(publicPageConfigSchema.safeParse({
    bookingTheme: { ...validConfig.bookingTheme, primary: 'green' },
  }).success, false);
  assert.equal(publicPageConfigSchema.safeParse({
    ...validConfig,
    adminOnly: true,
  }).success, false);
});

test('las camas extra públicas quedan desactivadas si no se configuran', () => {
  assert.equal(publicPageConfigSchema.parse(validConfig).publicExtraBeds, undefined);
  assert.equal(publicPageConfigSchema.safeParse({ ...validConfig, publicExtraBeds: { enabled: false, serviceId: null } }).success, true);
});

test('habilitar camas extra públicas exige elegir un servicio válido', () => {
  assert.equal(publicPageConfigSchema.safeParse({ ...validConfig, publicExtraBeds: { enabled: true, serviceId: 12 } }).success, true);
  for (const publicExtraBeds of [{ enabled: true, serviceId: null }, { enabled: true, serviceId: -1 }, { enabled: 'true', serviceId: 1 }, { enabled: true, serviceId: 1, price: 20 }]) {
    assert.equal(publicPageConfigSchema.safeParse({ ...validConfig, publicExtraBeds }).success, false);
  }
});
