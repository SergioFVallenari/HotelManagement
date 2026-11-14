import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { env } from '../src/config/env.js';
import { getTenantId } from '../src/lib/tenant.js';
import { requireMobileAuth } from '../src/modules/mobile/mobile.middleware.js';
import { signMobileToken } from '../src/modules/mobile/mobile.token.js';
import { requireAuth } from '../src/middleware/auth.js';
import jwt from 'jsonwebtoken';

const user = { id: 1, username: 'recepcion', role: 'RECEPCIONISTA' as const, companyId: 7, companyName: 'Hotel' };
const response = { set: () => undefined } as unknown as Response;

function request(authorization?: string, companyId = '999'): Request {
  return {
    get: (name: string) => name === 'authorization' ? authorization : undefined,
    query: { companyId }, cookies: {},
  } as unknown as Request;
}

test('el middleware toma el tenant del JWT y lo mantiene en trabajo asíncrono', async () => {
  const { token } = signMobileToken(user, env.jwtSecret, '1h');
  const req = request(`Bearer ${token}`);
  let operation: Promise<void> | undefined;
  requireMobileAuth(req, response, () => {
    assert.equal(getTenantId(), user.companyId);
    operation = Promise.resolve().then(() => {
      assert.equal(getTenantId(), user.companyId);
      assert.equal(req.user?.companyId, user.companyId);
    });
  });
  assert.ok(operation);
  await operation;
  assert.equal(getTenantId(), null);
});

test('las peticiones móviles concurrentes no comparten tenant', async () => {
  const operations: Promise<void>[] = [];
  for (const companyId of [7, 12]) {
    const { token } = signMobileToken({ ...user, companyId }, env.jwtSecret, '1h');
    requireMobileAuth(request(`Bearer ${token}`), response, () => {
      operations.push(Promise.resolve().then(() => {
        assert.equal(getTenantId(), companyId);
      }));
    });
  }
  await Promise.all(operations);
});

test('una cookie web no autentica mobile ni un Bearer móvil autentica la web', () => {
  const req = request();
  req.cookies = { gh_token: jwt.sign(user, env.jwtSecret) };
  assert.throws(() => requireMobileAuth(req, response, () => assert.fail('No debe continuar')), { statusCode: 401 });
  const { token } = signMobileToken(user, env.jwtSecret, '1h');
  const mobileReq = request(`Bearer ${token}`);
  assert.throws(() => requireAuth(mobileReq, response, () => assert.fail('No debe continuar')), { statusCode: 401 });
  mobileReq.cookies = { gh_token: token };
  assert.throws(() => requireAuth(mobileReq, response, () => assert.fail('No debe continuar')), { statusCode: 401 });
});
