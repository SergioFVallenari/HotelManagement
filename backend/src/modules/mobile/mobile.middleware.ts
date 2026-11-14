import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/AppError.js';
import { withTenant } from '../../lib/tenant.js';
import { readMobileBearer, verifyMobileToken } from './mobile.token.js';

export function requireMobileAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readMobileBearer(req.get('authorization'));
  if (!token) throw unauthorized('Se requiere un token Bearer de la app móvil');

  let user;
  try {
    user = verifyMobileToken(token, env.jwtSecret);
  } catch {
    throw unauthorized('Token móvil inválido o expirado');
  }
  req.user = user;
  res.set('Cache-Control', 'no-store');
  withTenant(user.companyId, next);
}
