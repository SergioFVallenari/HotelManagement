import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/AppError.js';
import type { AuthUser } from '../types/auth.js';

interface JwtPayload extends AuthUser {
  iat?: number;
  exp?: number;
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('Se requiere token de autenticación');
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.user = {
      id: payload.id,
      username: payload.username,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch {
    throw unauthorized('Token inválido o expirado');
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (req.user?.role !== 'ADMIN') {
    throw forbidden('Se requiere rol de administrador');
  }
  next();
}