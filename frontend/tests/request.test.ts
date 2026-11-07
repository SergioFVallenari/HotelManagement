import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, requestJson } from '../src/api/request.ts';

const URL = 'https://hotel.example/api/rooms';
const isAbort = (err: unknown) => err instanceof Error && err.name === 'AbortError';
const isTimeout = (err: unknown) => err instanceof ApiError && err.status === 408 && err.code === 'TIMEOUT';

function waitForAbort(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    signal.throwIfAborted();
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('una señal ya cancelada no envía la petición', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await assert.rejects(requestJson(URL, { signal: AbortSignal.abort() }), isAbort);
  assert.equal(fetch.mock.callCount(), 0);
});

test('cancelar durante fetch propaga la cancelación sin convertirla en timeout', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => waitForAbort(options.signal!));
  const request = requestJson(URL, { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, isAbort);
});

test('el timeout de fetch mantiene el error de API en español', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => waitForAbort(options.signal!));
  await assert.rejects(requestJson(URL, { timeoutMs: 5 }), isTimeout);
});

test('el timeout también cubre la lectura del cuerpo', async (t) => {
  let reading = false;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => ({
    ok: true,
    text: () => {
      reading = true;
      return waitForAbort(options.signal!);
    },
  }));
  await assert.rejects(requestJson(URL, { timeoutMs: 5 }), isTimeout);
  assert.equal(reading, true);
});

test('cancelar leyendo el cuerpo no dispara expiración de sesión ni entrega datos', async (t) => {
  const controller = new AbortController();
  const unauthorized = t.mock.fn();
  let startReading: () => void;
  const reading = new Promise<void>((resolve) => { startReading = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => ({
    ok: false,
    status: 401,
    text: () => {
      startReading();
      return waitForAbort(options.signal!);
    },
  }));
  const request = requestJson(URL, { signal: controller.signal, timeoutMs: 0 }, unauthorized);
  await reading;
  controller.abort();
  await assert.rejects(request, isAbort);
  assert.equal(unauthorized.mock.callCount(), 0);
});

test('una respuesta exitosa limpia el listener y conserva las opciones HTTP', async (t) => {
  const controller = new AbortController();
  const add = t.mock.method(controller.signal, 'addEventListener');
  const remove = t.mock.method(controller.signal, 'removeEventListener');
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{"data":[]}'));
  assert.deepEqual(await requestJson(URL, { signal: controller.signal }), { data: [] });
  const options = fetch.mock.calls[0].arguments[1] as RequestInit;
  assert.equal(options.credentials, 'include');
  assert.equal(options.method, 'GET');
  assert.deepEqual(options.headers, {});
  assert.equal(remove.mock.calls[0].arguments[1], add.mock.calls[0].arguments[1]);
  controller.abort();
  assert.equal(options.signal?.aborted, false);
});

test('los errores HTTP conservan código, detalles y notificación de sesión', async (t) => {
  const unauthorized = t.mock.fn();
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    error: { message: 'Sesión vencida', code: 'AUTH_REQUIRED', details: { reason: 'expired' } },
  }), { status: 401 }));
  await assert.rejects(requestJson(URL, {}, unauthorized), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.message, 'Sesión vencida');
    assert.equal(err.status, 401);
    assert.equal(err.code, 'AUTH_REQUIRED');
    assert.deepEqual(err.details, { reason: 'expired' });
    return true;
  });
  assert.equal(unauthorized.mock.callCount(), 1);
});

test('un fallo de red no se interpreta como cancelación o timeout', async (t) => {
  const error = new TypeError('Failed to fetch');
  t.mock.method(globalThis, 'fetch', async () => { throw error; });
  await assert.rejects(requestJson(URL), (err) => err === error);
});

test('todas las escrituras incluyen la cabecera CSRF, incluso sin cuerpo', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{"ok":true}'));
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'post']) {
    await requestJson(URL, { method });
    const options = fetch.mock.calls.at(-1)!.arguments[1] as RequestInit;
    assert.equal(options.method, method.toUpperCase());
    assert.deepEqual(options.headers, { 'X-GH-CSRF': '1' });
    assert.equal(options.body, undefined);
    assert.equal(options.credentials, 'include');
  }
});

test('las escrituras JSON conservan Content-Type y agregan la cabecera CSRF', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('{}'));
  await requestJson(URL, { method: 'POST', body: { name: 'Huésped' } });
  const options = fetch.mock.calls[0].arguments[1] as RequestInit;
  assert.deepEqual(options.headers, { 'Content-Type': 'application/json', 'X-GH-CSRF': '1' });
  assert.equal(options.body, JSON.stringify({ name: 'Huésped' }));
});
