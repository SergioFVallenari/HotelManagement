import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteAvailabilityServices } from '../src/lib/availabilityServices.js';
import { publicAvailabilityQuerySchema } from '../src/modules/booking/booking.schema.js';
import { updateCompanySettingsSchema } from '../src/modules/companies/companies.schema.js';
import { createServiceSchema, updateServiceSchema } from '../src/modules/services/services.schema.js';
import { intervalServiceOccurrences, serviceQuantity } from '../src/lib/pricing.js';

const available = [
  { id: 1, name: 'Desayuno', price: 1500.15, chargeType: 'PER_PERSON' as const },
  { id: 2, name: 'Estacionamiento', price: 2000, chargeType: 'PER_DAY' as const },
  { id: 3, name: 'Vianda', price: 3000, chargeType: 'PACK' as const },
];

test('cotiza servicios para todo el grupo incluyendo huéspedes con cama extra sin duplicarlos', () => {
  const result = quoteAvailabilityServices(available, [{ serviceId: 1 }, { serviceId: 2 }, { serviceId: 3, quantity: 2 }], 5, 3);
  assert.deepEqual(result.services.map((line) => line.quantity), [15, 3, 2]);
  assert.deepEqual(result.services.map((line) => line.lineTotal), [22502.25, 6000, 6000]);
  assert.equal(result.servicesTotal, 34502.25);
});

test('no permite reducir unidades por persona o noche y PACK usa una unidad por defecto', () => {
  const result = quoteAvailabilityServices(available, [{ serviceId: 1, quantity: 1 }, { serviceId: 2, quantity: 1 }, { serviceId: 3 }], 5, 3);
  assert.deepEqual(result.services.map((line) => line.quantity), [15, 3, 1]);
});

test('rechaza servicios no publicados o retirados y permite consulta sin servicios', () => {
  assert.throws(() => quoteAvailabilityServices(available, [{ serviceId: 4 }], 2, 1), /ya no está disponible/);
  assert.throws(() => quoteAvailabilityServices([], [{ serviceId: 1 }], 2, 1), /ya no está disponible/);
  assert.deepEqual(quoteAvailabilityServices(available, [], 2, 1), { services: [], servicesTotal: 0 });
});

test('valida formato, límites, duplicados y campos de los servicios públicos', () => {
  const query = { checkIn: '2026-11-02', checkOut: '2026-11-05', persons: '5' };
  assert.deepEqual(publicAvailabilityQuerySchema.parse({ ...query, services: '[{"serviceId":3,"quantity":2}]' }).services, [{ serviceId: 3, quantity: 2 }]);
  for (const services of ['{', '{}', '[{"serviceId":1},{"serviceId":1}]', '[{"serviceId":1,"quantity":0}]', '[{"serviceId":1,"quantity":1.5}]', '[{"serviceId":1,"quantity":1001}]', '[{"serviceId":1,"price":0}]']) {
    assert.equal(publicAvailabilityQuerySchema.safeParse({ ...query, services }).success, false);
  }
});

test('configuración del owner valida identificadores públicos sin duplicados', () => {
  const bookingTheme = { primary: '#000000', secondary: '#000000', accent: '#000000', text: '#000000', background: '#FFFFFF' };
  assert.equal(updateCompanySettingsSchema.safeParse({ configPage: { bookingTheme, publicServiceIds: [1, 2] } }).success, true);
  assert.equal(updateCompanySettingsSchema.safeParse({ configPage: { bookingTheme, publicServiceIds: [1, 1] } }).success, false);
  assert.equal(updateCompanySettingsSchema.safeParse({ configPage: { bookingTheme, publicServiceIds: [-1] } }).success, false);
});

test('frecuencia automática excluye llegada y salida, incluyendo intervalos exactos y estadías cortas', () => {
  for (const [nights, every, expected] of [[10, 3, 3], [6, 3, 1], [3, 3, 0], [2, 3, 0], [1, 1, 0], [10, 1, 9], [7, 3, 2]]) {
    assert.equal(intervalServiceOccurrences(nights, every), expected);
    assert.equal(serviceQuantity('PER_ROOM_INTERVAL', { persons: 4, extraBeds: 0, nights, roomCount: 2 }, 999, false, every), expected * 2);
  }
});

test('limpieza se cobra por habitaciones y no por personas, y solo si se selecciona', () => {
  const services = [{ id: 4, name: 'Limpieza', description: 'Baño y toallas', chargeType: 'PER_ROOM_INTERVAL' as const, intervalDays: 3, price: 5000 }];
  const one = quoteAvailabilityServices(services, [{ serviceId: 4, quantity: 999 }], 4, 10, 1);
  const two = quoteAvailabilityServices(services, [{ serviceId: 4 }], 4, 10, 2);
  assert.equal(one.servicesTotal, 15000);
  assert.equal(two.servicesTotal, 30000);
  assert.equal(two.services[0].quantity, 6);
  assert.equal(two.services[0].description, 'Baño y toallas');
  assert.equal(two.services[0].intervalDays, 3);
  assert.equal(quoteAvailabilityServices(services, [], 4, 10, 2).servicesTotal, 0);
  assert.equal(quoteAvailabilityServices(services, [{ serviceId: 4 }], 4, 3, 2).servicesTotal, 0);
  assert.equal(quoteAvailabilityServices(services, [{ serviceId: 4 }], 4, 10, 0).servicesTotal, 0);
});

test('la descripción no modifica la cantidad ni la modalidad de cobro de un pack', () => {
  const result = quoteAvailabilityServices([{ ...available[2], description: 'Spa de una hora cada dos días durante la estadía.' }], [{ serviceId: 3, quantity: 1 }], 4, 10, 2);
  assert.equal(result.services[0].quantity, 1);
  assert.equal(result.servicesTotal, 3000);
  assert.equal(result.services[0].intervalDays, null);
});

test('valida descripción opcional y exige frecuencia solo para intervenciones sin camas extra', () => {
  const base = { name: 'Limpieza', price: 5000, chargeType: 'PER_ROOM_INTERVAL', intervalDays: 3 };
  assert.equal(createServiceSchema.parse({ ...base, description: '  Baño y toallas  ' }).description, 'Baño y toallas');
  assert.equal(createServiceSchema.safeParse({ name: 'Spa', price: 20000, description: null }).success, true);
  assert.equal(updateServiceSchema.safeParse({ description: 'Solo modificar descripción' }).success, true);
  for (const changes of [{ description: 'x'.repeat(1001) }, { intervalDays: null }, { intervalDays: 0 }, { intervalDays: 1.5 }, { intervalDays: 366 }, { isExtraBed: true }, { chargeType: 'PACK' }]) {
    assert.equal(createServiceSchema.safeParse({ ...base, ...changes }).success, false);
  }
  const partial = updateServiceSchema.parse({ chargeType: 'PACK' });
  assert.equal(createServiceSchema.safeParse({ ...base, ...partial }).success, false);
  assert.equal(createServiceSchema.safeParse({ ...base, ...partial, intervalDays: null }).success, true);
});
