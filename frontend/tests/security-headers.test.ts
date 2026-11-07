import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { frontendSecurityHeaders } from '../config/securityHeaders.ts';

function sources(csp: string, name: string): string[] {
  return csp.split(';').map((directive) => directive.trim().split(/\s+/)).find(([key]) => key === name)?.slice(1) ?? [];
}

test('Vite y preview envían CSP efectiva, anti-framing, nosniff y no-store, sin HSTS local', () => {
  for (const development of [true, false]) {
    const headers = frontendSecurityHeaders(development);
    assert.ok(headers['Content-Security-Policy']);
    assert.equal(headers['Content-Security-Policy-Report-Only'], undefined);
    assert.equal(headers['X-Frame-Options'], 'SAMEORIGIN');
    assert.equal(headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(headers['Referrer-Policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['Cache-Control'], 'no-store');
    assert.equal(headers['Strict-Transport-Security'], undefined);
  }
});

test('solo desarrollo permite scripts inline y los WebSockets locales de HMR', () => {
  const dev = frontendSecurityHeaders(true)['Content-Security-Policy'];
  const preview = frontendSecurityHeaders(false)['Content-Security-Policy'];
  assert.ok(sources(dev, 'script-src').includes("'unsafe-inline'"));
  assert.ok(!sources(preview, 'script-src').includes("'unsafe-inline'"));
  for (const websocket of ['ws://localhost:*', 'ws://127.0.0.1:*', 'wss://localhost:*', 'wss://127.0.0.1:*']) {
    assert.ok(sources(dev, 'connect-src').includes(websocket));
    assert.ok(!sources(preview, 'connect-src').includes(websocket));
  }
  assert.ok(!dev.includes("'unsafe-eval'"));
  assert.ok(!preview.includes("'unsafe-eval'"));
});

test('preview reutiliza la política de CloudFront sin debilitarla ni modificarla', () => {
  const file = new URL('../cloudfront-response-headers.json', import.meta.url);
  const policy = JSON.parse(readFileSync(file, 'utf8'));
  const original = policy.CustomHeadersConfig.Items.find((header: { Header: string }) => header.Header === 'Content-Security-Policy-Report-Only').Value;
  const preview = frontendSecurityHeaders(false)['Content-Security-Policy'];
  assert.equal(preview, original);
  frontendSecurityHeaders(true, 'http://localhost:3100');
  assert.equal(frontendSecurityHeaders(false)['Content-Security-Policy'], original);
  assert.deepEqual(sources(preview, 'script-src'), ["'self'"]);
  assert.deepEqual(sources(preview, 'object-src'), ["'none'"]);
  assert.deepEqual(sources(preview, 'frame-ancestors'), ["'self'"]);
});

test('permite únicamente el origen del backend configurado, sin copiar rutas ni credenciales', () => {
  for (const development of [true, false]) {
    const csp = frontendSecurityHeaders(development, 'http://user:password@127.0.0.1:3100/api')['Content-Security-Policy'];
    assert.ok(sources(csp, 'connect-src').includes('http://127.0.0.1:3100'));
    assert.ok(!csp.includes('password'));
    assert.ok(!csp.includes('/api'));
    assert.ok(!sources(csp, 'connect-src').includes('http:'));
    assert.ok(!sources(csp, 'connect-src').includes('*'));
  }
});

test('no duplica el host productivo y rechaza protocolos ajenos a HTTP', () => {
  const backend = 'https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws';
  const csp = frontendSecurityHeaders(false, backend)['Content-Security-Policy'];
  assert.equal(sources(csp, 'connect-src').filter((source) => source === backend).length, 1);
  assert.throws(() => frontendSecurityHeaders(false, 'javascript:alert(1)'), /HTTP o HTTPS/);
});
