import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyBillingTestAccounts } from '../src/modules/billing/providers/billingTestAccounts.js';
import { readMercadoPagoBillingIdentity } from '../src/modules/billing/providers/mercadoPagoIdentity.js';

const payment = { collector_id: 10, payer: { id: '20' } };
const seller = { id: 10, tags: ['test_user'], email: 'privado@example.test' };
const buyer = { id: '20', tags: ['normal', 'test_user'] };

test('exige dos identidades de prueba y vincula al cobrador con la credencial', async () => {
  const reads: string[] = [];
  const result = await verifyBillingTestAccounts(payment, async (id) => { reads.push(id); return id === 'me' ? seller : buyer; });
  assert.deepEqual(reads, ['me', '20']);
  assert.deepEqual(result, { verified: true });
});

test('no usa emails, nombres ni ausencia de tags como prueba de cuenta de testing', async () => {
  for (const user of [{ ...seller, tags: [] }, { ...seller, tags: undefined }, { ...seller, tags: 'test_user' }, { ...seller, tags: ['normal'], email: 'test_user_123@testuser.com' }]) {
    assert.deepEqual(await verifyBillingTestAccounts(payment, async () => user), { verified: false, reason: 'TEST_TAG_UNAVAILABLE' });
  }
});

test('rechaza cobrador ajeno, comprador ajeno y comprador sin tag', async () => {
  assert.deepEqual(await verifyBillingTestAccounts(payment, async () => ({ ...seller, id: 11 })), { verified: false, reason: 'SELLER_MISMATCH' });
  for (const [user, reason] of [[{ ...buyer, id: '21' }, 'BUYER_MISMATCH'], [{ ...buyer, tags: [] }, 'TEST_TAG_UNAVAILABLE']] as const) {
    assert.deepEqual(await verifyBillingTestAccounts(payment, async (id) => id === 'me' ? seller : user), { verified: false, reason });
  }
});

test('no consulta identidades inexistentes, iguales, inseguras o inválidas', async () => {
  for (const value of [null, {}, { ...payment, payer: null }, { ...payment, collector_id: 20 }, { ...payment, collector_id: Number.MAX_SAFE_INTEGER + 1 }, { ...payment, payer: { id: '../20' } }]) {
    assert.deepEqual(await verifyBillingTestAccounts(value, async () => { throw new Error('No debe consultar'); }), { verified: false, reason: 'IDENTITY_UNAVAILABLE' });
  }
});

test('un fallo de consulta bloquea sin revelar datos de la respuesta o credencial', async () => {
  const result = await verifyBillingTestAccounts(payment, async () => { throw new Error('secreto'); });
  assert.deepEqual(result, { verified: false, reason: 'IDENTITY_UNAVAILABLE' });
});

test('consulta identidades solo por GET, sin redirecciones y exclusivamente en testing', async () => {
  const options = { enabled: true, environment: 'testing' as const, accessToken: 'simulado', transport: fetch };
  for (const id of ['me', '20']) {
    const result = await readMercadoPagoBillingIdentity(id, { ...options, transport: async (url, init) => {
      assert.equal(url, `https://api.mercadopago.com/users/${id}`);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error');
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer simulado');
      return new Response(JSON.stringify(seller));
    } });
    assert.deepEqual(result, seller);
  }
  const forbidden: typeof fetch = async () => { throw new Error('Solicitud inesperada'); };
  for (const config of [{ ...options, environment: 'production' as const }, { ...options, enabled: false }, { ...options, accessToken: '' }]) {
    await assert.rejects(readMercadoPagoBillingIdentity('me', { ...config, transport: forbidden }), /no está habilitada/);
  }
  for (const id of ['../me', '0', '01', 'me?token=123', 'https://example.test']) {
    await assert.rejects(readMercadoPagoBillingIdentity(id, { ...options, transport: forbidden }), /no es válido/);
  }
});

test('sanitiza errores de red, HTTP y JSON de las identidades', async () => {
  for (const transport of [async () => { throw new Error('secreto'); }, async () => new Response('secreto', { status: 403 }), async () => new Response('secreto')] satisfies Array<typeof fetch>) {
    await assert.rejects(readMercadoPagoBillingIdentity('me', { enabled: true, environment: 'testing', accessToken: 'simulado', transport }), (error: Error) => !error.message.includes('secreto'));
  }
});
