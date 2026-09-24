import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/AppError.js';
import { AUTH_COOKIE, authCookieOptions } from '../../lib/cookie.js';
import type { CredentialsInput, LoginInput } from './auth.schema.js';
import { credentialsSchema, loginSchema } from './auth.schema.js';

export async function loginForCompanies(req: Request, res: Response): Promise<void> {
  const input = credentialsSchema.parse(req.body) as CredentialsInput;

  const users = await prisma.user.findMany({
    where: { username: input.username, isActive: true },
    include: { company: { select: { id: true, name: true } }, type: { select: { role: true } } },
  });

  const companies = [];
  for (const user of users) {
    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (valid) companies.push({ id: user.company.id, name: user.company.name, role: user.type.role });
  }
  if (companies.length === 0) throw unauthorized();

  res.json({ companies });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body) as LoginInput;

  const user = await prisma.user.findFirst({
    where: { companyId: input.companyId, username: input.username, isActive: true },
    include: { type: true },
  });
  if (!user) throw unauthorized();

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw unauthorized();

  const payload = {
    id: user.id,
    username: user.username,
    role: user.type.role,
    name: user.name,
    companyId: user.companyId,
  };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.json({ user: payload });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  res.json({ ok: true });
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}