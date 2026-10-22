import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { signOauthState, verifyOauthState, buildAuthorizeUrl, IG_SCOPES, IG_WEBHOOK_FIELDS } from '../src/modules/instagram/instagram.oauth.js';
import { buildSubscribeUrl, buildUnsubscribeUrl } from '../src/modules/instagram/instagram.client.js';

process.env.JWT_SECRET = 'test-secret-32-chars-minimum-123456';
process.env.INSTAGRAM_APP_ID = '123';
process.env.INSTAGRAM_APP_SECRET = 'secret';
process.env.INSTAGRAM_REDIRECT_URI = 'http://localhost:3000/api/integrations/instagram/callback';
process.env.DATABASE_URL = 'postgres://test';
process.env.SUPABASE_URL = 'url';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key';
process.env.SUPABASE_ANON_KEY = 'anon';
process.env.MP_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

describe('instagram oauth state', () => {
  it('firma y valida state válido', () => {
    const s = signOauthState({companyId:1, uid:'5', csrf:'x', ts:Date.now()});
    const p = verifyOauthState(s);
    assert.equal(p.companyId,1);
    assert.equal(p.uid,'5');
  });
  it('rechaza firma inválida', () => {
    const s = signOauthState({companyId:1, uid:'5', csrf:'x', ts:Date.now()});
    const bad = s + 'bad';
    assert.throws(()=>verifyOauthState(bad));
  });
  it('rechaza expirado', () => {
    const s = signOauthState({companyId:1, uid:'5', csrf:'x', ts:Date.now()-11*60*1000});
    assert.throws(()=>verifyOauthState(s));
  });
  it('arma la URL de Instagram Login con scopes correctos', () => {
    const url = new URL(buildAuthorizeUrl('state-123'));
    assert.equal(url.origin + url.pathname, 'https://www.instagram.com/oauth/authorize');
    assert.equal(url.searchParams.get('response_type'), 'code');
    assert.equal(url.searchParams.get('state'), 'state-123');
    assert.equal(url.searchParams.get('scope'), IG_SCOPES);
    assert.ok(IG_SCOPES.includes('instagram_business_basic'));
    assert.ok(IG_SCOPES.includes('instagram_business_manage_messages'));
  });
});

describe('instagram webhook subscription', () => {
  it('suscribe solo los campos de mensajes y lecturas', () => {
    assert.equal(IG_WEBHOOK_FIELDS, 'messages,messaging_seen');
  });

  it('arma la URL POST de subscribed_apps con los campos y el token', () => {
    const url = new URL(buildSubscribeUrl('TOKEN', IG_WEBHOOK_FIELDS));
    assert.equal(url.pathname.endsWith('/me/subscribed_apps'), true);
    assert.equal(url.searchParams.get('subscribed_fields'), IG_WEBHOOK_FIELDS);
    assert.equal(url.searchParams.get('access_token'), 'TOKEN');
  });

  it('arma la URL DELETE de subscribed_apps solo con el token', () => {
    const url = new URL(buildUnsubscribeUrl('TOKEN'));
    assert.equal(url.pathname.endsWith('/me/subscribed_apps'), true);
    assert.equal(url.searchParams.get('subscribed_fields'), null);
    assert.equal(url.searchParams.get('access_token'), 'TOKEN');
  });
});
