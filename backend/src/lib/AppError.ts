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

export const rateLimitExceeded = (message = 'Demasiadas solicitudes. Intentá nuevamente más tarde.') => {
  switch (message) {
    case 'over_email_send_rate_limit':
      return new AppError(429, 'EMAIL_RATE_LIMIT', 'Se alcanzó el límite de envío de emails de confirmación. Esperá unos minutos y volvé a intentar.');
    case 'over_request_rate_limit':
      return new AppError(429, 'AUTH_RATE_LIMIT', 'Demasiadas solicitudes a Supabase Auth. Intentá nuevamente más tarde.');
    default:
      return new AppError(429, 'RATE_LIMIT_EXCEEDED', message);
  }
}