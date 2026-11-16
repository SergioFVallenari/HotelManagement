import { test } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { rotateMobileSession, revokeMobileSession, createMobileSession } from '../src/modules/mobile/mobile.service.js';
import { createRefreshToken, hashRefreshToken, refreshState, MOBILE_REFRESH_TTL_MS } from '../src/modules/mobile/mobile.refresh.js';
import { mobileRefreshSchema } from '../src/modules/mobile/mobile.schema.js';
import { verifyMobileToken, signMobileToken } from '../src/modules/mobile/mobile.token.js';
import { requiresCsrfHeader } from '../src/lib/requestSecurity.js';
import jwt from 'jsonwebtoken';

const user = { id: 1, username: 'recepcion', role: 'RECEPCIONISTA' as const, companyId: 7, companyName: 'Hotel' };

function fixture(t: TestContext) {
  const first = createRefreshToken();
  const session = {
    id: 'sesion', userId: 1, companyId: 7, revokedAt: null as Date | null,
    expiresAt: new Date(Date.now() + MOBILE_REFRESH_TTL_MS),
    membership: {
      userId: 1, companyId: 7, username: 'actual', isActive: true,
      user: { name: 'Ana', email: 'ana@example.test' },
      type: { role: 'ADMIN' }, company: { createdById: 1, name: 'Hotel actualizado' },
    },
  };
  const tokens = new Map<string, any>([[first.hash, { hash: first.hash, sessionId: session.id, consumedAt: null, session }]]);
  const tx = {
    $queryRaw: t.mock.fn(async () => [{ id: session.id }]),
    mobileRefreshToken: {
      findUnique: async ({ where }: any) => tokens.get(where.hash) ?? null,
      update: async ({ where, data }: any) => Object.assign(tokens.get(where.hash), data),
      create: async ({ data }: any) => { tokens.set(data.hash, { ...data, consumedAt: null, session }); },
    },
    mobileSession: {
      update: async ({ data }: any) => Object.assign(session, data),
      updateMany: async ({ data }: any) => Object.assign(session, data),
    },
  };
  const original = prisma.$transaction;
  prisma.$transaction = (async (callback: any) => callback(tx)) as typeof original;
  t.after(() => { prisma.$transaction = original; });
  return { first, session, tokens, tx };
}

test('genera secretos aleatorios y almacena únicamente su hash', () => {
  const a = createRefreshToken();
  const b = createRefreshToken();
  assert.notEqual(a.refreshToken, b.refreshToken);
  assert.equal(a.hash, hashRefreshToken(a.refreshToken));
  assert.notEqual(a.hash, a.refreshToken);
  assert.equal(mobileRefreshSchema.parse({ refreshToken: a.refreshToken }).refreshToken, a.refreshToken);
  for (const refreshToken of ['', 'invalido', signMobileToken(user, env.jwtSecret, '15m').token]) {
    assert.equal(mobileRefreshSchema.safeParse({ refreshToken }).success, false);
  }
});

test('detecta expiración exacta, revocación y reutilización', () => {
  const now = new Date();
  const session = { revokedAt: null, expiresAt: new Date(now.getTime() + 1) };
  assert.equal(refreshState(session, null, now), 'active');
  assert.equal(refreshState(session, now, now), 'reused');
  assert.equal(refreshState({ ...session, expiresAt: now }, null, now), 'invalid');
  assert.equal(refreshState({ ...session, revokedAt: now }, null, now), 'invalid');
});

test('login crea una sesión de 30 días y access token de 15 minutos', async (t) => {
  const original = prisma.mobileSession.create;
  const create = t.mock.fn(async (_args: any) => ({}));
  prisma.mobileSession.create = create as unknown as typeof original;
  t.after(() => { prisma.mobileSession.create = original; });
  const result = await createMobileSession(user);
  const payload = jwt.decode(result.accessToken) as jwt.JwtPayload;
  assert.equal(payload.exp! - payload.iat!, 900);
  assert.equal(result.token, result.accessToken);
  assert.deepEqual(verifyMobileToken(result.accessToken, env.jwtSecret), user);
  const data = create.mock.calls[0].arguments[0].data;
  assert.equal(data.userId, 1);
  assert.equal(data.companyId, 7);
  assert.equal(data.tokens.create.hash, hashRefreshToken(result.refreshToken));
  assert.ok(Math.abs(Date.parse(result.refreshExpiresAt) - Date.now() - MOBILE_REFRESH_TTL_MS) < 2000);
});

test('refresh funciona sin access token, rota el secreto y actualiza los datos desde la membresía', async (t) => {
  const { first, session, tokens, tx } = fixture(t);
  const input = mobileRefreshSchema.parse({ refreshToken: first.refreshToken, companyId: 999, role: 'OWNER' });
  assert.deepEqual(input, { refreshToken: first.refreshToken });
  const result = await rotateMobileSession(input.refreshToken);
  assert.notEqual(result.refreshToken, first.refreshToken);
  assert.ok(tokens.get(first.hash).consumedAt);
  assert.ok(tokens.has(hashRefreshToken(result.refreshToken)));
  assert.equal(result.user.companyId, 7);
  assert.equal(result.user.role, 'ADMIN');
  assert.equal(result.user.username, 'actual');
  assert.equal(result.user.companyName, 'Hotel actualizado');
  assert.equal(result.refreshExpiresAt, session.expiresAt.toISOString());
  assert.deepEqual(verifyMobileToken(result.accessToken, env.jwtSecret), result.user);
  assert.equal(tx.$queryRaw.mock.callCount(), 1);
});

test('reutilizar un token consumido revoca también su sucesor', async (t) => {
  const { first, session } = fixture(t);
  const next = await rotateMobileSession(first.refreshToken);
  await assert.rejects(rotateMobileSession(first.refreshToken), { statusCode: 401 });
  assert.ok(session.revokedAt);
  await assert.rejects(rotateMobileSession(next.refreshToken), { statusCode: 401 });
});

test('rechaza refresh token desconocido o vencido', async (t) => {
  const { first, session } = fixture(t);
  await assert.rejects(rotateMobileSession(createRefreshToken().refreshToken), { statusCode: 401 });
  session.expiresAt = new Date(0);
  await assert.rejects(rotateMobileSession(first.refreshToken), { statusCode: 401 });
});

test('rechaza y revoca sesiones sin membresía activa o de OWNER sin propiedad', async (t) => {
  const { first, session } = fixture(t);
  session.membership.isActive = false;
  await assert.rejects(rotateMobileSession(first.refreshToken), { statusCode: 401 });
  assert.ok(session.revokedAt);
  session.revokedAt = null;
  session.membership.isActive = true;
  session.membership.type.role = 'OWNER';
  session.membership.company.createdById = 999;
  await assert.rejects(rotateMobileSession(first.refreshToken), { statusCode: 401 });
  assert.ok(session.revokedAt);
});

test('logout revoca toda la sesión usando incluso un refresh token consumido y es idempotente', async (t) => {
  const { first, session } = fixture(t);
  const next = await rotateMobileSession(first.refreshToken);
  await revokeMobileSession(first.refreshToken);
  assert.ok(session.revokedAt);
  await revokeMobileSession(first.refreshToken);
  await revokeMobileSession(createRefreshToken().refreshToken);
  await assert.rejects(rotateMobileSession(next.refreshToken), { statusCode: 401 });
});

test('refresh y logout móviles conservan el header CSRF', () => {
  for (const path of ['/api/mobile/auth/refresh', '/api/mobile/auth/logout']) {
    assert.equal(requiresCsrfHeader('POST', path), true);
  }
});
