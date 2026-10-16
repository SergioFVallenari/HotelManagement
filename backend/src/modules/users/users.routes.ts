import { timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { requireAuth, requireOwnerOrAdmin } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { createUser, listUsers, registerUser, sendVerificationCode } from './users.controller.js';

const router = Router();

// Si REGISTER_KEY esta seteada, el registro (incluido el envio del codigo)
// exige "key" en el body: las rutas siguen existiendo pero cierran por secreto.
function registerKeyGuard(req: Request, _res: Response, next: NextFunction): void {
  if (!env.registerKey) {
    console.log('Register key not set, allowing registration without key');
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

router.post('/send-code', registerRate, registerKeyGuard, sendVerificationCode);
router.post('/register', registerRate, registerKeyGuard, registerUser);

router.use(requireAuth);

router.get('/', requireOwnerOrAdmin, listUsers);
router.post('/', requireOwnerOrAdmin, createUser);

export default router;
