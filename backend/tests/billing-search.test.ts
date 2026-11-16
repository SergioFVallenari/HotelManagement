import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectMercadoPagoSubscriptions } from '../src/modules/billing/providers/mercadoPagoSearch.js';

const options = { enabled: true, environment: 'testing' as const, accessToken: 'token-simulado', transport: fetch };

function transport(body: unknown): typeof fetch {
  return async (url, init) => {
    assert.equal(url, 'https://api.mercadopago.com/preapproval/search?limit=100&offset=0');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify(body));
  };
}

test('inspecciona una página sin crear ni modificar suscripciones', async () => {
  const result = await inspectMercadoPagoSubscriptions({ ...options, transport: transport({ paging: { offset: 0, limit: 100, total: 1 }, results: [{ id: 'sub-1' }] }) });
  assert.deepEqual(result, { candidates: [{ id: 'sub-1' }], singlePage: true });
});

test('marca como incompleta una página parcial y rechaza paginación inconsistente', async () => {
  assert.equal((await inspectMercadoPagoSubscriptions({ ...options, transport: transport({ paging: { offset: 0, limit: 100, total: 2 }, results: [{ id: '1' }] }) })).singlePage, false);
  for (const paging of [{ offset: 1, limit: 100, total: 1 }, { offset: 0, limit: 0, total: 1 }, { offset: 0, limit: 100, total: 0 }, { offset: 0, limit: 100 }]) {
    await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, transport: transport({ paging, results: [{ id: '1' }] }) }));
  }
});

test('no consulta fuera de testing o con la función apagada', async () => {
  const forbidden: typeof fetch = async () => { throw new Error('No debe hacer una solicitud'); };
  await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, environment: 'production', transport: forbidden }), /no está habilitada/);
  await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, enabled: false, transport: forbidden }), /no está habilitada/);
});
