import { createHash, randomBytes } from 'node:crypto';

export const MOBILE_ACCESS_TTL = '15m';
export const MOBILE_REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createRefreshToken() {
  const refreshToken = randomBytes(48).toString('base64url');
  return { refreshToken, hash: hashRefreshToken(refreshToken) };
}

export function refreshState(session: { revokedAt: Date | null; expiresAt: Date }, consumedAt: Date | null, now: Date) {
  if (session.revokedAt || session.expiresAt <= now) return 'invalid';
  return consumedAt ? 'reused' : 'active';
}
