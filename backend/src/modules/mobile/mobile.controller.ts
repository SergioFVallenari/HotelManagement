import type { Request, Response } from 'express';
import { resolveLoginSession } from '../auth/auth.controller.js';
import { loginSchema } from '../auth/auth.schema.js';
import { mobileRefreshSchema } from './mobile.schema.js';
import { createMobileSession, revokeMobileSession, rotateMobileSession } from './mobile.service.js';

export async function mobileLoginCompany(req: Request, res: Response): Promise<void> {
  const user = await resolveLoginSession(loginSchema.parse(req.body));
  res.json({ data: await createMobileSession(user) });
}

export async function mobileRefresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = mobileRefreshSchema.parse(req.body);
  res.json({ data: await rotateMobileSession(refreshToken) });
}

export async function mobileLogout(req: Request, res: Response): Promise<void> {
  const { refreshToken } = mobileRefreshSchema.parse(req.body);
  await revokeMobileSession(refreshToken);
  res.json({ data: { success: true } });
}
