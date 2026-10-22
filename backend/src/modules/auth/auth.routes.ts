import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { requireAuth, requireOwner } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { confirmationEmail, login, loginForCompanies, logout, me, register, resend, switchCompany } from './auth.controller.js';

const router = Router();

// Si REGISTER_KEY esta seteada, el alta publica exige "key" en el body: las rutas
// siguen existiendo pero cierran por secreto.
function registerKeyGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!env.registerKey) {
    next();
    return;
  }
  const body = req.body as { key?: unknown } | undefined;
  const key = typeof body?.key === 'string' ? body.key : '';
  const expected = Buffer.from(env.registerKey);
  const actual = Buffer.from(key);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new AppError(403, 'REGISTER_KEY_REQUIRED', 'Se requiere una clave de registro válida');
  }
  next();
}

const registerRate = rateLimiter(5, 15 * 60 * 1000);

router.post('/login', rateLimiter(5, 15 * 60 * 1000), loginForCompanies);
router.post('/login/company', rateLimiter(5, 15 * 60 * 1000), login);
router.post('/register', registerKeyGuard, register);
router.post('/resend-confirmation', registerKeyGuard, resend);
router.post('/switch-company', requireAuth, requireOwner, switchCompany);
router.post('/logout', logout);
router.get('/me', requireAuth, me);
router.get('/confirm-email', confirmationEmail);

export default router;
