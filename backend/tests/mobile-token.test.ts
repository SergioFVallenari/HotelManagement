import { test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createHmac } from 'node:crypto';
import { readMobileBearer, signMobileToken, verifyMobileToken } from '../src/modules/mobile/mobile.token.js';
import { requiresCsrfHeader } from '../src/lib/requestSecurity.js';

const secret = 'secreto-local-para-pruebas';
const user = { id: 1, username: 'recepcion', role: 'RECEPCIONISTA' as const, companyId: 7, companyName: 'Hotel', name: 'Ana', email: 'ana@example.test' };

test('emite una sesión para cada rol interno y conserva el hotel', () => {
  for (const role of ['OWNER', 'ADMIN', 'RECEPCIONISTA'] as const) {
    const session = signMobileToken({ ...user, role }, secret, '2h');
    assert.equal(session.tokenType, 'Bearer');
    assert.deepEqual(verifyMobileToken(session.token, secret), { ...user, role });
    const payload = jwt.decode(session.token) as jwt.JwtPayload;
    assert.equal(payload.exp! - payload.iat!, 7200);
    assert.equal(session.expiresAt, new Date(payload.exp! * 1000).toISOString());
  }
});

test('los tokens web, móviles y de otro secreto no son intercambiables', () => {
  const { token } = signMobileToken(user, secret, '2h');
  assert.throws(() => jwt.verify(token, secret));
  assert.throws(() => verifyMobileToken(jwt.sign(user, secret), secret));
  assert.throws(() => verifyMobileToken(token, 'otro-secreto'));
  assert.throws(() => verifyMobileToken('invalido', secret));
  assert.throws(() => verifyMobileToken(signMobileToken(user, secret, '-1s').token, secret));
});

test('exige issuer, audience, rol y tenant válidos incluso con firma válida', () => {
  const key = createHmac('sha256', secret).update('gestion-hotel/mobile/v1').digest();
  const options = { issuer: 'gestion-hotel-mobile', audience: 'gestion-hotel-mobile-calendar' };
  for (const payload of [{ ...user, role: 'GUEST' }, { ...user, companyId: 0 }, { ...user, companyId: '7' }]) {
    assert.throws(() => verifyMobileToken(jwt.sign(payload, key, options), secret));
  }
  assert.throws(() => verifyMobileToken(jwt.sign(user, key), secret));
  assert.throws(() => verifyMobileToken(jwt.sign(user, key, { ...options, audience: 'web' }), secret));
  assert.throws(() => verifyMobileToken(jwt.sign(user, key, { ...options, issuer: 'otro' }), secret));
});

test('solo admite el formato Bearer explícito', () => {
  assert.equal(readMobileBearer('Bearer abc.def.ghi'), 'abc.def.ghi');
  assert.equal(readMobileBearer('bearer token'), 'token');
  for (const value of [undefined, '', 'Basic token', 'token', 'Bearer ', 'Bearer a b']) {
    assert.equal(readMobileBearer(value), undefined);
  }
});

test('login móvil conserva la protección CSRF', () => {
  for (const path of ['/mobile/auth/login', '/mobile/auth/login/company']) {
    assert.equal(requiresCsrfHeader('POST', `/api${path}`), true);
  }
});
