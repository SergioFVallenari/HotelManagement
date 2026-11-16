import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../lib/AppError.js';

export function requireInstagramMessaging(_req: Request, _res: Response, next: NextFunction): void {
  if (!env.instagramMessagingEnabled) throw new AppError(503, 'INSTAGRAM_DISABLED', 'La mensajería de Instagram está desactivada.');
  next();
}

export function requireInboxAi(_req: Request, _res: Response, next: NextFunction): void {
  if (!env.inboxAiEnabled) throw new AppError(503, 'INBOX_AI_DISABLED', 'Las respuestas de IA de la bandeja están desactivadas.');
  next();
}
