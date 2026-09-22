export class AppError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Credenciales inválidas') =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'No tenés permisos para esta acción') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource: string, id?: number | string) =>
  new AppError(404, 'NOT_FOUND', `${resource}${id !== undefined ? ` ${id}` : ''} no existe`);

export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(409, code, message, details);