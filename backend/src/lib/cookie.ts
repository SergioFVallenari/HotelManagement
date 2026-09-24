import type { CookieOptions } from 'express';
import { env } from '../config/env.js';

export const AUTH_COOKIE = 'gh_token';

function maxAgeFromExpiresIn(expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn.trim());
  if (!match) return 12 * 60 * 60 * 1000;
  const value = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * multipliers[unit];
}

export function authCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: env.isProduction ? 'none' : 'lax',
    secure: env.isProduction,
    maxAge: maxAgeFromExpiresIn(env.jwtExpiresIn),
    path: '/',
  };
}