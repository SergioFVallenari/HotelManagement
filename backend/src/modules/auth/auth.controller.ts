import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/AppError.js';
import type { LoginInput } from './auth.schema.js';
import { loginSchema } from './auth.schema.js';

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body) as LoginInput;

  const user = await prisma.user.findUnique({
    where: { username: input.username },
    include: { type: true },
  });
  if (!user || !user.isActive) throw unauthorized();

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw unauthorized();

  const payload = { id: user.id, username: user.username, role: user.type.role, name: user.name };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

  res.json({ token, user: payload });
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}