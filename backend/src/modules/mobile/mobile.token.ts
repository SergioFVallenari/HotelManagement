import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { mobileSessionSchema } from './mobile.schema.js';
import type { z } from 'zod';

const issuer = 'gestion-hotel-mobile';
const audience = 'gestion-hotel-mobile-calendar';

function mobileKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('gestion-hotel/mobile/v1').digest();
}

export function signMobileToken(user: z.infer<typeof mobileSessionSchema>, secret: string, expiresIn: string) {
  const token = jwt.sign(mobileSessionSchema.parse(user), mobileKey(secret), {
    algorithm: 'HS256', issuer, audience,
    expiresIn: expiresIn as jwt.SignOptions['expiresIn'],
  });
  const { exp } = jwt.decode(token) as jwt.JwtPayload;
  return { token, tokenType: 'Bearer' as const, expiresAt: new Date(exp! * 1000).toISOString() };
}

export function verifyMobileToken(token: string, secret: string) {
  return mobileSessionSchema.parse(jwt.verify(token, mobileKey(secret), {
    algorithms: ['HS256'], issuer, audience,
  }));
}

export function readMobileBearer(authorization: string | undefined): string | undefined {
  return /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
}
