import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import type { ZodError } from 'zod';
import { AppError } from '../lib/AppError.js';

function unknownToError(err: unknown): { statusCode: number; code: string; message: string; details?: unknown } {
  if (err instanceof AppError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message, details: err.details };
  }

  if (err && typeof err === 'object' && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
    const httpError = err as { status: number; type?: string; message?: string };
    if (httpError.status >= 400 && httpError.status < 500) {
      return {
        statusCode: httpError.status,
        code: httpError.type === 'entity.parse.failed' ? 'INVALID_JSON' : 'BAD_REQUEST',
        message: httpError.type === 'entity.parse.failed' ? 'JSON inválido en el cuerpo de la petición' : (httpError.message ?? 'Solicitud inválida'),
      };
    }
  }

  if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'ZodError') {
    const zod = err as ZodError;
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Datos inválidos',
      details: zod.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta?.target.join(', ') : err.meta?.target;
      return {
        statusCode: 409,
        code: 'DUPLICATE',
        message: `Ya existe un registro con el mismo valor (${target ?? 'campo único'})`,
      };
    }
    if (err.code === 'P2025') {
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Registro no encontrado' };
    }
  }

  console.error(err);
  return { statusCode: 500, code: 'INTERNAL_ERROR', message: 'Error interno del servidor' };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const { statusCode, code, message, details } = unknownToError(err);
  res.status(statusCode).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ruta no encontrada' } });
}