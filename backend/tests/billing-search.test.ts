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
  assert.deepEqual(result, { candidates: [{ id: 'sub-1' }], complete: true });
});

test('rechaza paginación inconsistente', async () => {
  for (const paging of [{ offset: 1, limit: 100, total: 1 }, { offset: 0, limit: 0, total: 1 }, { offset: 0, limit: 100, total: 0 }, { offset: 0, limit: 100 }]) {
    await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, transport: transport({ paging, results: [{ id: '1' }] }) }));
  }
});

test('recorre todas las páginas usando solo consultas GET', async () => {
  const offsets: number[] = [];
  const result = await inspectMercadoPagoSubscriptions({ ...options, transport: async (url, init) => {
    const offset = Number(new URL(String(url)).searchParams.get('offset'));
    offsets.push(offset);
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    return new Response(JSON.stringify({ paging: { offset, limit: 1, total: 2 }, results: [{ id: `sub-${offset}` }] }));
  } });
  assert.deepEqual(offsets, [0, 1]);
  assert.deepEqual(result, { candidates: [{ id: 'sub-0' }, { id: 'sub-1' }], complete: true });
});

test('una búsqueda vacía es completa', async () => {
  assert.deepEqual(await inspectMercadoPagoSubscriptions({ ...options, transport: transport({ paging: { offset: 0, limit: 100, total: 0 }, results: [] }) }), { candidates: [], complete: true });
});

test('no considera completa una búsqueda cambiante, repetida o sin avance', async () => {
  for (const mode of ['total', 'duplicate', 'empty', 'invalid']) {
    let calls = 0;
    const result = await inspectMercadoPagoSubscriptions({ ...options, transport: async () => {
      const offset = calls++;
      const results = offset === 0 ? [{ id: 'first' }] : mode === 'empty' ? [] : [{ id: mode === 'duplicate' ? 'first' : mode === 'invalid' ? null : 'second' }];
      return new Response(JSON.stringify({ paging: { offset, limit: 1, total: offset > 0 && mode === 'total' ? 3 : 2 }, results }));
    } });
    assert.equal(result.complete, false);
    assert.equal(calls, 2);
  }
});

test('acota el número de páginas sin declarar completa una búsqueda truncada', async () => {
  let calls = 0;
  const result = await inspectMercadoPagoSubscriptions({ ...options, transport: async () => {
    const offset = calls++;
    return new Response(JSON.stringify({ paging: { offset, limit: 1, total: 11 }, results: [{ id: String(offset) }] }));
  } });
  assert.equal(calls, 10);
  assert.equal(result.complete, false);
});

test('propaga fallos de red, HTTP o JSON sin exponer credenciales', async () => {
  for (const transport of [
    async () => { throw new Error('token-simulado'); },
    async () => new Response('token-simulado', { status: 401 }),
    async () => new Response('token-simulado'),
  ] satisfies Array<typeof fetch>) {
    await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, transport }), (error: Error) => !error.message.includes('token-simulado'));
  }
});

test('no consulta fuera de testing o con la función apagada', async () => {
  const forbidden: typeof fetch = async () => { throw new Error('No debe hacer una solicitud'); };
  await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, environment: 'production', transport: forbidden }), /no está habilitada/);
  await assert.rejects(inspectMercadoPagoSubscriptions({ ...options, enabled: false, transport: forbidden }), /no está habilitada/);
});
