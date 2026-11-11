import { createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';

const audience = 'reserva-interna-ia';
const key = (secret: string) => createHmac('sha256', secret).update(audience).digest('hex');

export function signReservationProposal(payload: Record<string, unknown>, secret: string): string {
  return jwt.sign(payload, key(secret), { algorithm: 'HS256', audience, expiresIn: '10m' });
}

export function verifyReservationProposal(token: string, secret: string): jwt.JwtPayload {
  return jwt.verify(token, key(secret), { algorithms: ['HS256'], audience }) as jwt.JwtPayload;
}
