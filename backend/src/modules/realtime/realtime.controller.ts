import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { realtimeEnabled, realtimeTopic, signRealtimeToken } from '../../lib/realtime.js';

export function getConfigHandler(req: Request, res: Response): void {
  const user = req.user;
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Se requiere autenticación');

  if (!realtimeEnabled()) {
    throw new AppError(503, 'REALTIME_DISABLED', 'Realtime no está configurado. La bandeja usa el modo de respaldo.');
  }

  res.json({
    data: {
      url: env.supabase.url,
      key: env.supabase.anonKey,
      topic: realtimeTopic(user.companyId),
      token: signRealtimeToken(user.companyId, user.id),
      expiresIn: 3600,
    },
  });
}
