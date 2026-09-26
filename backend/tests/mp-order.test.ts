import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildExternalReference, buildOrderPayload, toEventDate } from '../src/modules/mercadopago/mp.order.js';

const APP_URL = 'https://app.example.com';

describe('toEventDate', () => {
  it('convierte la fecha de check-in a date-time ISO 8601', () => {
    assert.equal(toEventDate('2026-12-01'), '2026-12-01T00:00:00-03:00');
  });

  it('omite event_date cuando no hay fecha o no es valida', () => {
    assert.equal(toEventDate(null), undefined);
    assert.equal(toEventDate(undefined), undefined);
    assert.equal(toEventDate(''), undefined);
    assert.equal(toEventDate('01/12/2026'), undefined);
  });
});

describe('buildExternalReference', () => {
  it('usa guion y no dos puntos, que MercadoPago rechaza', () => {
    assert.equal(buildExternalReference(1, 'RSV-ABC123'), '1-RSV-ABC123');
    assert.equal(buildExternalReference(42, 'RSV-XY9'), '42-RSV-XY9');
  });

  it('solo usa caracteres aceptados por el patron de MercadoPago', () => {
    const ref = buildExternalReference(7, 'RSV-MDX9K2PQQQ1');
    assert.match(ref, /^[A-Za-z0-9-]+$/);
  });
});

describe('buildOrderPayload', () => {
  const base = { companyId: 1, code: 'RSV-ABC123', amount: 1500.5, appUrl: APP_URL };

  it('arma el payload que MercadoPago acepta para_orders', () => {
    const payload = buildOrderPayload({
      ...base,
      guest: { email: 'huesped@example.com', firstName: 'Ana', lastName: 'Diaz' },
      checkIn: '2026-12-01',
    });

    assert.equal(payload.type, 'online');
    assert.equal(payload.processing_mode, 'manual');
    assert.equal(payload.currency, 'ARS');
    assert.equal(payload.total_amount, '1500.50');
    assert.equal(payload.external_reference, '1-RSV-ABC123');
    assert.deepEqual(payload.payer, { email: 'huesped@example.com' });

    const items = payload.items as Record<string, unknown>[];
    assert.equal(items.length, 1);
    assert.equal(items[0].external_code, 'RSV-RSV-ABC123');
    assert.equal(items[0].unit_price, '1500.50');
    assert.equal(items[0].category_id, 'accommodations');
    assert.equal(items[0].event_date, '2026-12-01T00:00:00-03:00');
  });

  it('no manda additional_info ni category_descriptor porque Orders v2 los rechaza', () => {
    const payload = buildOrderPayload({
      ...base,
      guest: { email: 'huesped@example.com', firstName: 'Ana', lastName: 'Diaz' },
      checkIn: '2026-12-01',
    });

    assert.equal('additional_info' in payload, false);
    const items = payload.items as Record<string, unknown>[];
    assert.equal('category_descriptor' in items[0], false);
  });

  it('omite event_date y payer cuando no hay datos', () => {
    const payload = buildOrderPayload({ ...base, guest: null, checkIn: null });

    assert.equal('payer' in payload, false);
    const items = payload.items as Record<string, unknown>[];
    assert.equal('event_date' in items[0], false);
  });

  it('arma las urls de retorno apuntando a la app', () => {
    const payload = buildOrderPayload(base);
    const online = (payload.config as Record<string, Record<string, unknown>>).online;

    assert.equal(online.success_url, `${APP_URL}/pago?reservation=RSV-ABC123`);
    assert.equal(online.failure_url, `${APP_URL}/pago?reservation=RSV-ABC123`);
    assert.equal(online.pending_url, `${APP_URL}/pago?reservation=RSV-ABC123`);
    assert.equal(online.auto_return, 'approved');
  });

  it('tolera appUrl con barra final', () => {
    const payload = buildOrderPayload({ ...base, appUrl: 'https://app.example.com/' });
    const online = (payload.config as Record<string, Record<string, unknown>>).online;

    assert.equal(online.success_url, `${APP_URL}/pago?reservation=RSV-ABC123`);
  });

  it('serializa sin claves con valor undefined', () => {
    const payload = buildOrderPayload({ ...base, guest: null, checkIn: null });
    assert.equal(JSON.stringify(payload).includes('undefined'), false);
  });
});
