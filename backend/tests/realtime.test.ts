import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = 'postgres://test';
process.env.JWT_SECRET = 'test-secret-32-chars-minimum-123456';
process.env.SUPABASE_URL = 'https://proj.supabase.co/';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.SUPABASE_JWT_SECRET = 'supabase-jwt-secret';
process.env.INSTAGRAM_APP_ID = '123';
process.env.INSTAGRAM_APP_SECRET = 'secret';
process.env.INSTAGRAM_REDIRECT_URI = 'http://localhost:3000/api/integrations/instagram/callback';

const { realtimeEnabled, realtimeTopic, signRealtimeToken } = await import('../src/lib/realtime.js');

describe('realtime', () => {
  it('arma el topic por empresa', () => {
    assert.equal(realtimeTopic(7), 'company:7');
  });

  it('firma un token de Realtime con el claim company_id y expiración de 1 hora', () => {
    const token = signRealtimeToken(7, 42);
    const [, payloadB64] = token.split('.');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<string, unknown>;

    assert.equal(claims.company_id, 7);
    assert.equal(claims.sub, '42');
    assert.equal(claims.role, 'authenticated');
    assert.equal(claims.aud, 'authenticated');
    assert.equal((claims.exp as number) - (claims.iat as number), 3600);
  });

  it('realtimeEnabled es true cuando hay SUPABASE_JWT_SECRET', () => {
    assert.equal(realtimeEnabled(), true);
  });
});
