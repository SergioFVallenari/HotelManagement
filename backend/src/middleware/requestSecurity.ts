import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/AppError.js';
import { isTrustedOrigin, requiresCsrfHeader } from '../lib/requestSecurity.js';

export function csrfProtection(allowedOrigins: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!requiresCsrfHeader(req.method, req.path)) {
      next();
      return;
    }
    // La cabecera no es un secreto: obliga al navegador a pasar el preflight CORS.
    if (req.get('X-GH-CSRF') !== '1' || !isTrustedOrigin(req.get('Origin'), allowedOrigins)) {
      throw new AppError(403, 'SOLICITUD_NO_PERMITIDA', 'El origen de la solicitud no está permitido o falta la protección CSRF');
    }
    next();
  };
}

export function securityHeaders(isProduction: boolean) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Cache-Control': 'no-store',
    });
    if (isProduction) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  };
}
