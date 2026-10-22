import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const TOKEN_TTL_SECONDS = 60 * 60;

export function realtimeEnabled(): boolean {
  return Boolean(env.supabase.jwtSecret);
}

export function realtimeTopic(companyId: number): string {
  return `company:${companyId}`;
}

export function signRealtimeToken(companyId: number, userId: number): string {
  return jwt.sign(
    { role: 'authenticated', aud: 'authenticated', company_id: companyId },
    env.supabase.jwtSecret,
    { subject: String(userId), expiresIn: TOKEN_TTL_SECONDS },
  );
}
