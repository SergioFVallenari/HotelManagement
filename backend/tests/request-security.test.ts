import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import cors from 'cors';
import type { ErrorRequestHandler } from 'express';
import { AppError } from '../src/lib/AppError.js';
import { isTrustedOrigin, requiresCsrfHeader } from '../src/lib/requestSecurity.js';
import { csrfProtection, securityHeaders } from '../src/middleware/requestSecurity.js';

const ORIGIN = 'https://hotel.example';

test('las lecturas y el preflight no necesitan cabecera CSRF', () => {
  for (const method of ['GET', 'HEAD', 'OPTIONS']) {
    assert.equal(requiresCsrfHeader(method, '/api/reservations/1/cancel'), false);
  }
});

test('solo se exceptúan los dos webhooks y las escrituras públicas por token', () => {
  for (const path of [
    '/api/mp/webhook', '/api/integrations/instagram/webhook',
    '/api/public/booking/token', '/api/public/booking/token/receipt',
    '/API/MP/WEBHOOK/',
  ]) assert.equal(requiresCsrfHeader('POST', path), false, path);

  for (const path of [
    '/api/reservations/1/cancel', '/api/auth/logout', '/api/auth/login',
    '/api/auth/login/company', '/api/auth/register', '/api/auth/switch-company',
    '/api/booking-links/1/cancel', '/api/rooms/1', '/api/custom/webhook',
    '/api/mp/webhook/extra', '/api/public/booking/token/cancel',
  ]) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal(requiresCsrfHeader(method, path), true, `${method} ${path}`);
    }
  }
});

test('la allowlist de origen es exacta y admite CLI sin Origin, pero nunca null', () => {
  const allowed = [ORIGIN, 'https://localhost'];
  assert.equal(isTrustedOrigin(ORIGIN, allowed), true);
  assert.equal(isTrustedOrigin('https://localhost', allowed), true);
  assert.equal(isTrustedOrigin(undefined, allowed), true);
  for (const origin of ['null', 'https://evil.example', `${ORIGIN}.evil.example`, `${ORIGIN}/`, 'http://hotel.example']) {
    assert.equal(isTrustedOrigin(origin, allowed), false, origin);
  }
  assert.equal(isTrustedOrigin('https://evil.example', ['*']), false);
});

test('el middleware bloquea formularios y orígenes externos antes de ejecutar una acción', async (t) => {
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders(true));
  app.use(cors({ origin: [ORIGIN, 'https://localhost'], credentials: true }));
  app.use(csrfProtection([ORIGIN, 'https://localhost']));
  let actions = 0;
  app.use((_req, res) => {
    actions += 1;
    res.json({ ok: true });
  });
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    assert.ok(error instanceof AppError);
    res.status(error.statusCode).json({ error: { code: error.code } });
  };
  app.use(errors);
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;

  for (const path of ['/api/auth/logout', '/api/reservations/1/cancel', '/api/reservations/1/approve']) {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded', Cookie: 'gh_token=session' },
      body: '',
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000');
    assert.equal(response.headers.get('x-powered-by'), null);
    assert.deepEqual(await response.json(), { error: { code: 'SOLICITUD_NO_PERMITIDA' } });
  }
  const blockedHeaders: Record<string, string>[] = [
    { Origin: ORIGIN },
    { Origin: 'https://evil.example', 'X-GH-CSRF': '1' },
    { Origin: 'null', 'X-GH-CSRF': '1' },
    { 'X-GH-CSRF': 'wrong' },
  ];
  for (const headers of blockedHeaders) {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
    assert.equal(response.status, 403);
    await response.arrayBuffer();
  }
  assert.equal(actions, 0);

  const allowedHeaders: Record<string, string>[] = [
    { Origin: ORIGIN, 'X-GH-CSRF': '1' },
    { Origin: 'https://localhost', 'X-GH-CSRF': '1' },
    { 'X-GH-CSRF': '1' },
  ];
  for (const headers of allowedHeaders) {
    const response = await fetch(`${base}/api/auth/logout`, { method: 'POST', headers });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  for (const path of ['/api/mp/webhook', '/api/integrations/instagram/webhook', '/api/public/booking/token', '/api/public/booking/token/receipt']) {
    const response = await fetch(`${base}${path}`, { method: 'POST' });
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  const read = await fetch(`${base}/api/auth/me`);
  assert.equal(read.status, 200);
  await read.arrayBuffer();
  assert.equal(actions, 8);

  for (const origin of [ORIGIN, 'https://evil.example']) {
    const preflight = await fetch(`${base}/api/auth/logout`, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'X-GH-CSRF',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin === ORIGIN ? ORIGIN : null);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /X-GH-CSRF/i);
  }
  assert.equal(actions, 8);
});

test('HSTS no se emite para el entorno de desarrollo', () => {
  const headers: Record<string, string> = {};
  const res = { set: (values: Record<string, string>) => Object.assign(headers, values) };
  let next = false;
  securityHeaders(false)({} as express.Request, res as unknown as express.Response, () => { next = true; });
  assert.equal(headers['Strict-Transport-Security'], undefined);
  assert.equal(headers['Cache-Control'], 'no-store');
  assert.equal(next, true);
});
