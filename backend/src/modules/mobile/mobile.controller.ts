import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { resolveLoginSession } from '../auth/auth.controller.js';
import { loginSchema } from '../auth/auth.schema.js';
import { signMobileToken } from './mobile.token.js';

export async function mobileLoginCompany(req: Request, res: Response): Promise<void> {
  const user = await resolveLoginSession(loginSchema.parse(req.body));
  const session = signMobileToken(user, env.jwtSecret, env.jwtExpiresIn);
  res.json({ data: { ...session, user } });
}
