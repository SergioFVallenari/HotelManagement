import crypto from 'node:crypto';
import { env } from '../../config/env.js';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 min

export const IG_SCOPES = 'instagram_business_basic,instagram_business_manage_messages';

export const IG_WEBHOOK_FIELDS = 'messages,messaging_seen';

export interface InstagramOauthState {
  companyId: number;
  uid: string;
  csrf: string;
  ts: number;
}

export function signOauthState(payload: InstagramOauthState): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', env.jwtSecret)
    .update(body)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifyOauthState(state: string): InstagramOauthState {
  const parts = state.split('.');
  if (parts.length !== 2) throw new Error('invalid_state');
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', env.jwtSecret).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    throw new Error('invalid_state');
  }
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InstagramOauthState;
  if (Date.now() > payload.ts + STATE_TTL_MS) throw new Error('state_expired');
  if (!payload.companyId || !payload.uid || !payload.csrf) throw new Error('invalid_state');
  return payload;
}

export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.ig.appId,
    redirect_uri: env.ig.redirectUri,
    scope: IG_SCOPES,
    response_type: 'code',
    state,
  });
  return `${env.ig.authorizeUrl}?${params.toString()}`;
}
