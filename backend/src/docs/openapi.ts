import { z } from 'zod';
import * as schemas from './schemas.js';
import { credentialsSchema, loginSchema, registerSchema, resendSchema, switchCompanySchema } from '../modules/auth/auth.schema.js';
import { createRoomSchema, updateRoomSchema } from '../modules/rooms/rooms.schema.js';
import { createRoomTypeSchema, updateRoomTypeSchema } from '../modules/roomTypes/roomTypes.schema.js';
import { createGuestSchema, updateGuestSchema } from '../modules/guests/guests.schema.js';
import { createServiceSchema, updateServiceSchema } from '../modules/services/services.schema.js';
import {
  createReservationSchema,
  updateReservationSchema,
} from '../modules/reservations/reservations.schema.js';
import { recordPaymentSchema } from '../modules/payments/payments.schema.js';
import { createCompanySchema } from '../modules/companies/companies.schema.js';
import { createUserSchema } from '../modules/users/users.schema.js';
import { authUrlSchema, regenerateSchema } from '../modules/mercadopago/mp.schema.js';

type Json = Record<string, unknown>;

function js(schema: z.ZodType, io: 'input' | 'output' = 'output'): Json {
  const out = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Json;
  delete out.$schema;
  return out;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });

const errResponse = (description: string): Json => ({
  description,
  content: { 'application/json': { schema: ref('ErrorEnvelope') } },
});

const COMMON_ERRORS: Record<string, string> = {
  '400': 'Datos inválidos (`VALIDATION_ERROR`, `BAD_REQUEST`, `INVALID_JSON`)',
  '401': 'No autenticado (`UNAUTHORIZED`): falta la cookie `gh_token` o el token es inválido/expirado',
  '403': 'Sin permisos (`FORBIDDEN`): el rol no puede realizar esta operación',
  '404': 'No encontrado (`NOT_FOUND`)',
  '429': 'Demasiadas solicitudes (`RATE_LIMIT_EXCEEDED`). Ver headers `RateLimit`, `RateLimit-Policy` y `Retry-After`',
  '500': 'Error interno (`INTERNAL_ERROR`)',
};

const ok = (inner: Json, meta: boolean | string = false): Json => ({
  description:
    typeof meta === 'string'
      ? `Operación exitosa. Envelope: \`{ data }\`. ${meta}`
      : 'Operación exitosa. Envelope: `{ data }`.',
  content: {
    'application/json': {
      schema: meta === true
        ? { type: 'object', properties: { data: inner, meta: ref('Meta') } }
        : { type: 'object', properties: { data: inner } },
    },
  },
});

const okPlain = (properties: Json, description = 'Operación exitosa'): Json => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties, additionalProperties: false } } },
});

const empty = (description: string): Json => ({ description });

const jsonBody = (schema: Json, description: string, required = true): Json => ({
  required,
  description,
  content: { 'application/json': { schema } },
});

const queryParam = (name: string, description: string, extra: Json = {}): Json => ({
  name,
  in: 'query',
  description,
  ...extra,
});

const pathIdParam = (description: string): Json => ({
  name: 'id',
  in: 'path',
  required: true,
  description,
  schema: { type: 'integer', format: 'int64' },
});

const sessionSecurity: Json[] = [{ cookieAuth: [] }];
const publicSecurity: Json[] = [];

interface OpSpec {
  tags: string[];
  summary: string;
  description?: string;
  security?: Json[];
  parameters?: Json[];
  requestBody?: Json;
  responses: Record<string, Json>;
}

function op(spec: OpSpec): Json {
  return {
    tags: spec.tags,
    summary: spec.summary,
    ...(spec.description ? { description: spec.description } : {}),
    ...(spec.parameters && spec.parameters.length ? { parameters: spec.parameters } : {}),
    ...(spec.requestBody ? { requestBody: spec.requestBody } : {}),
    responses: spec.responses,
    security: spec.security ?? sessionSecurity,
  };
}

function errors(extra: Record<string, string> = {}): Record<string, Json> {
  const merged: Record<string, string> = { ...COMMON_ERRORS, ...extra };
  return Object.fromEntries(Object.entries(merged).map(([status, description]) => [status, errResponse(description)]));
}

const noRole = 'Cualquier rol de la empresa (OWNER, ADMIN o RECEPCIONISTA).';
const ownerOrAdmin = 'Requiere rol `OWNER` o `ADMIN`.';
const adminOnly = 'Requiere rol `ADMIN`.';
const ownerOnly = 'Requiere rol `OWNER`.';

const PUBLIC: ReadonlyArray<[string, string]> = [
  ['/health', 'get'],
  ['/api/auth/login', 'post'],
  ['/api/auth/login/company', 'post'],
  ['/api/auth/logout', 'post'],
  ['/api/mp/oauth/callback', 'get'],
  ['/api/mp/webhook', 'post'],
  ['/api/integrations/instagram/callback', 'get'],
  ['/api/integrations/instagram/webhook', 'get'],
  ['/api/integrations/instagram/webhook', 'post'],
  ['/api/auth/register', 'post'],
  ['/api/auth/resend-confirmation', 'post'],
  ['/api/auth/confirm-email', 'get'],
];

const componentSchemas: Record<string, Json> = {
  Company: js(schemas.companySchema),
  AuthUser: js(schemas.authUserSchema),
  Meta: js(schemas.metaSchema),
  ErrorEnvelope: js(schemas.errorEnvelopeSchema),
  roleSchema: js(schemas.roleSchema),
  RoomType: js(schemas.roomTypeSchema),
  Room: js(schemas.roomSchema),
  Guest: js(schemas.guestSchema),
  GuestDetail: js(schemas.guestDetailSchema),
  Service: js(schemas.serviceSchema),
  Payment: js(schemas.paymentSchema),
  Reservation: js(schemas.reservationSchema),
  UserRow: js(schemas.userRowSchema),
  MpConnection: js(schemas.mpConnectionSchema),
  MpAuthorizationData: js(schemas.mpAuthorizationDataSchema),
  Summary: js(schemas.summarySchema),
  Calendar: js(schemas.calendarSchema),
  AvailableRoomsMeta: js(schemas.availableRoomsMetaSchema),
};

const paths: Record<string, Json> = {
  '/health': {
    get: op({
      tags: ['Estado'],
      summary: 'Health check del servidor',
      description: 'Público. No requiere autenticación ni encripta datos.',
      security: publicSecurity,
      responses: {
        '200': okPlain(
          {
            status: { type: 'string', example: 'ok' },
            uptime: { type: 'number', description: 'Segundos desde el arranque del proceso' },
          },
          'Servidor operativo',
        ),
        '500': errResponse('Error interno (`INTERNAL_ERROR`)'),
      },
    }),
  },

  '/api/auth/login': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Paso 1: credenciales',
      description:
        'Público. Valida email y contraseña contra Supabase Auth (GoTrue) y devuelve las empresas que el usuario ' +
        'posee (si es OWNER) o donde tiene una fila activa, junto con el access token de Supabase. ' +
        'Paso previo a `POST /api/auth/login/company`. Rate limit: 5 intentos / 15 min por IP.',
      security: publicSecurity,
      requestBody: jsonBody(js(credentialsSchema, 'input'), 'Email y contraseña'),
      responses: {
        '200': okPlain(
          {
            companies: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'integer' },
                  name: { type: 'string' },
                  role: { $ref: '#/components/schemas/roleSchema' },
                },
              },
            },
            token: { type: 'string', description: 'Access token de Supabase para el paso 2' },
          },
          'Empresas del usuario y token (sin envelope `data`)',
        ),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '401': 'Credenciales inválidas (`UNAUTHORIZED`)',
          '403': '`EMAIL_NOT_CONFIRMED` (email sin confirmar) o `FORBIDDEN` (cuenta deshabilitada)',
          '429': '`RATE_LIMIT_EXCEEDED`: 5 intentos / 15 min por IP',
        }),
      },
    }),
  },

  '/api/auth/login/company': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Paso 2: iniciar sesión en una empresa',
      description:
        'Público. Valida el access token del paso 1 y la pertenencia del usuario a la empresa elegida (el OWNER solo puede entrar a las empresas que posee), y emite la sesión en la cookie `httpOnly` `gh_token`. ' +
        'Rate limit: 5 intentos / 15 min por IP.',
      security: publicSecurity,
      requestBody: jsonBody(
        js(loginSchema, 'input'),
        '`companyId` del paso 1 + `token` (access token de Supabase)',
      ),
      responses: {
        '200': {
          description: 'Sesión iniciada. Devuelve el usuario (sin envelope `data`) y setea la cookie `gh_token`.',
          content: {
            'application/json': { schema: { type: 'object', properties: { user: ref('AuthUser') } } },
          },
          headers: {
            'Set-Cookie': { description: 'Cookie httpOnly `gh_token` (expiración según `JWT_EXPIRES_IN`)', schema: { type: 'string' } },
          },
        },
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '401': 'Credenciales inválidas (`UNAUTHORIZED`)',
          '429': '`RATE_LIMIT_EXCEEDED`: 5 intentos / 15 min por IP',
        }),
      },
    }),
  },

  '/api/auth/logout': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Cerrar sesión',
      description: 'Público. Invalida la sesión en el cliente limpiando la cookie `gh_token`.',
      security: publicSecurity,
      responses: {
        '200': okPlain({ ok: { type: 'boolean', example: true } }, 'Sesión cerrada'),
        '500': errResponse('Error interno (`INTERNAL_ERROR`)'),
      },
    }),
  },

  '/api/auth/switch-company': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Cambiar de empresa con la sesión activa',
      description:
        `${ownerOnly} Re-emite la sesión (cookie \`gh_token\`) apuntando a otra empresa del propietario, ` +
        'sin reingresar la contraseña. Devuelve el usuario con el `companyId` nuevo.',
      requestBody: jsonBody(js(switchCompanySchema, 'input'), 'ID de la empresa destino'),
      responses: {
        '200': {
          description: 'Empresa cambiada. Devuelve el usuario (sin envelope `data`) y setea la cookie `gh_token`.',
          content: {
            'application/json': { schema: { type: 'object', properties: { user: ref('AuthUser') } } },
          },
          headers: {
            'Set-Cookie': { description: 'Cookie httpOnly `gh_token` renovada', schema: { type: 'string' } },
          },
        },
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '404': '`NOT_FOUND`: la empresa no existe o no pertenece al propietario',
          '403': '`FORBIDDEN`: el usuario no es propietario o la empresa no lo reconoce como tal',
        }),
      },
    }),
  },

  '/api/auth/me': {
    get: op({
      tags: ['Autenticación'],
      summary: 'Usuario de la sesión actual',
      description: noRole,
      responses: {
        '200': {
          description: 'Datos del usuario autenticado (sin envelope `data`)',
          content: { 'application/json': { schema: { type: 'object', properties: { user: ref('AuthUser') } } } },
        },
        ...errors(),
      },
    }),
  },

  '/api/companies': {
    get: op({
      tags: ['Empresas'],
      summary: 'Listar hoteles',
      description: `${noRole} Rate limit específico: 30 solicitudes / min por IP.`,
      responses: {
        '200': ok({ type: 'array', items: ref('Company') }),
        ...errors({ '429': '`RATE_LIMIT_EXCEEDED`: 30 solicitudes / min por IP' }),
      },
    }),
    post: op({
      tags: ['Empresas'],
      summary: 'Crear hotel (propietario)',
      description: `${ownerOnly} Crea una nueva "Company" con un usuario "ADMIN" inicial.`,
      requestBody: jsonBody(js(createCompanySchema, 'input'), 'Datos del hotel y del administrador inicial'),
      responses: {
        '201': ok(ref('Company'), 'Hotel creado'),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`DUPLICATE`: ya existe un hotel con ese nombre',
        }),
      },
    }),
  },

  '/api/companies/owned': {
    get: op({
      tags: ['Empresas'],
      summary: 'Hoteles creados por el propietario',
      description: ownerOnly,
      responses: {
        '200': ok({ type: 'array', items: ref('Company') }),
        ...errors(),
      },
    }),
  },

  '/api/room-types': {
    get: op({
      tags: ['Tipos de habitación'],
      summary: 'Listar tipos de habitación',
      description: noRole,
      parameters: [
        queryParam('page', 'Página (1-indexada)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Cantidad por página (default 10, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
      ],
      responses: {
        '200': ok({ type: 'array', items: ref('RoomType') }, true),
        ...errors(),
      },
    }),
    post: op({
      tags: ['Tipos de habitación'],
      summary: 'Crear tipo de habitación',
      description: ownerOrAdmin,
      requestBody: jsonBody(js(createRoomTypeSchema, 'input'), 'Nombre del tipo'),
      responses: {
        '201': ok(ref('RoomType'), 'Tipo creado'),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`DUPLICATE`: ya existe un tipo con ese nombre en el hotel',
        }),
      },
    }),
  },

  '/api/room-types/{id}': {
    get: op({
      tags: ['Tipos de habitación'],
      summary: 'Obtener tipo de habitación',
      description: noRole,
      parameters: [pathIdParam('ID del tipo de habitación')],
      responses: {
        '200': ok(ref('RoomType')),
        ...errors(),
      },
    }),
    put: op({
      tags: ['Tipos de habitación'],
      summary: 'Actualizar tipo de habitación',
      description: adminOnly,
      parameters: [pathIdParam('ID del tipo de habitación')],
      requestBody: jsonBody(js(updateRoomTypeSchema, 'input'), 'Campos a actualizar'),
      responses: {
        '200': ok(ref('RoomType')),
        ...errors({ '409': '`DUPLICATE`: el nombre ya lo usa otro tipo' }),
      },
    }),
    delete: op({
      tags: ['Tipos de habitación'],
      summary: 'Eliminar tipo de habitación',
      description: adminOnly,
      parameters: [pathIdParam('ID del tipo de habitación')],
      responses: {
        '204': empty('Eliminado sin contenido'),
        ...errors({
          '409': '`TYPE_IN_USE`: el tipo tiene habitaciones asociadas',
        }),
      },
    }),
  },

  '/api/rooms': {
    get: op({
      tags: ['Habitaciones'],
      summary: 'Listar habitaciones',
      description: noRole,
      parameters: [
        queryParam('page', 'Página (1-indexada)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Cantidad por página (default 10, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
        queryParam('isActive', 'Filtrar por activas/inactivas', { schema: { type: 'boolean' } }),
        queryParam('typeId', 'Filtrar por tipo de habitación', { schema: { type: 'integer' } }),
        queryParam('search', 'Búsqueda por número o nombre', { schema: { type: 'string' } }),
      ],
      responses: {
        '200': ok({ type: 'array', items: ref('Room') }, true),
        ...errors(),
      },
    }),
    post: op({
      tags: ['Habitaciones'],
      summary: 'Crear habitación',
      description: ownerOrAdmin,
      requestBody: jsonBody(js(createRoomSchema, 'input'), 'Datos de la habitación'),
      responses: {
        '201': ok(ref('Room'), 'Habitación creada'),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`DUPLICATE`: ya existe una habitación con ese número en el hotel',
        }),
      },
    }),
  },

  '/api/rooms/available': {
    get: op({
      tags: ['Habitaciones'],
      summary: 'Habitaciones disponibles en un rango',
      description: `${noRole} Cruza disponibilidad contra reservas no canceladas.`,
      parameters: [
        queryParam('checkIn', 'Fecha de entrada YYYY-MM-DD', { required: true, schema: { type: 'string', format: 'date' } }),
        queryParam('checkOut', 'Fecha de salida YYYY-MM-DD', { required: true, schema: { type: 'string', format: 'date' } }),
        queryParam('typeId', 'Filtrar por tipo de habitación', { schema: { type: 'integer' } }),
      ],
      responses: {
        '200': {
          description: 'Operación exitosa. Envelope: `{ data, meta }`.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { data: { type: 'array', items: ref('Room') }, meta: ref('AvailableRoomsMeta') },
              },
            },
          },
        },
        ...errors({
          '400': '`VALIDATION_ERROR`/`BAD_REQUEST`: faltan fechas o el rango es inválido',
        }),
      },
    }),
  },

  '/api/rooms/{id}': {
    get: op({
      tags: ['Habitaciones'],
      summary: 'Obtener habitación',
      description: noRole,
      parameters: [pathIdParam('ID de la habitación')],
      responses: {
        '200': ok(ref('Room')),
        ...errors(),
      },
    }),
    put: op({
      tags: ['Habitaciones'],
      summary: 'Actualizar habitación',
      description: adminOnly,
      parameters: [pathIdParam('ID de la habitación')],
      requestBody: jsonBody(js(updateRoomSchema, 'input'), 'Campos a actualizar'),
      responses: {
        '200': ok(ref('Room')),
        ...errors({ '409': '`DUPLICATE`: el número ya lo usa otra habitación' }),
      },
    }),
    delete: op({
      tags: ['Habitaciones'],
      summary: 'Eliminar habitación',
      description: `${adminOnly} Fallará si la habitación tiene reservas (aunque estén canceladas).`,
      parameters: [pathIdParam('ID de la habitación')],
      responses: {
        '204': empty('Eliminada sin contenido'),
        ...errors({
          '409': '`ROOM_HAS_RESERVATIONS`: la habitación tiene reservas asociadas',
        }),
      },
    }),
  },

  '/api/guests': {
    get: op({
      tags: ['Huéspedes'],
      summary: 'Listar huéspedes',
      description: noRole,
      parameters: [
        queryParam('page', 'Página (1-indexada)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Cantidad por página (default 10, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
        queryParam('q', 'Búsqueda por nombre, email o teléfono', { schema: { type: 'string' } }),
      ],
      responses: {
        '200': ok({ type: 'array', items: ref('Guest') }, true),
        ...errors(),
      },
    }),
    post: op({
      tags: ['Huéspedes'],
      summary: 'Crear huésped',
      description: noRole,
      requestBody: jsonBody(js(createGuestSchema, 'input'), 'Datos del huésped'),
      responses: {
        '201': ok(ref('Guest'), 'Huésped creado'),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`GUEST_EXISTS`: ya existe un huésped con ese email en el hotel. `details` trae el huésped existente.',
        }),
      },
    }),
  },

  '/api/guests/{id}': {
    get: op({
      tags: ['Huéspedes'],
      summary: 'Obtener huésped con sus reservas',
      description: `${noRole} Incluye las últimas 20 reservas del huésped.`,
      parameters: [pathIdParam('ID del huésped')],
      responses: {
        '200': ok(ref('GuestDetail')),
        ...errors(),
      },
    }),
    put: op({
      tags: ['Huéspedes'],
      summary: 'Actualizar huésped',
      description: noRole,
      parameters: [pathIdParam('ID del huésped')],
      requestBody: jsonBody(js(updateGuestSchema, 'input'), 'Campos a actualizar'),
      responses: {
        '200': ok(ref('Guest')),
        ...errors({ '409': '`DUPLICATE`: el email ya lo usa otro huésped del hotel' }),
      },
    }),
  },

  '/api/services': {
    get: op({
      tags: ['Servicios'],
      summary: 'Listar servicios',
      description: noRole,
      parameters: [
        queryParam('page', 'Página (1-indexada)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Cantidad por página (default 10, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
        queryParam('isActive', 'Filtrar por activos/inactivos', { schema: { type: 'boolean' } }),
      ],
      responses: {
        '200': ok({ type: 'array', items: ref('Service') }, true),
        ...errors(),
      },
    }),
    post: op({
      tags: ['Servicios'],
      summary: 'Crear servicio',
      description: adminOnly,
      requestBody: jsonBody(js(createServiceSchema, 'input'), 'Datos del servicio'),
      responses: {
        '201': ok(ref('Service'), 'Servicio creado'),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`DUPLICATE`: ya existe un servicio con ese nombre en el hotel',
        }),
      },
    }),
  },

  '/api/services/{id}': {
    put: op({
      tags: ['Servicios'],
      summary: 'Actualizar servicio',
      description: adminOnly,
      parameters: [pathIdParam('ID del servicio')],
      requestBody: jsonBody(js(updateServiceSchema, 'input'), 'Campos a actualizar'),
      responses: {
        '200': ok(ref('Service')),
        ...errors({ '409': '`DUPLICATE`: el nombre ya lo usa otro servicio' }),
      },
    }),
    delete: op({
      tags: ['Servicios'],
      summary: 'Eliminar servicio',
      description: adminOnly,
      parameters: [pathIdParam('ID del servicio')],
      responses: {
        '204': empty('Eliminado sin contenido'),
        ...errors({
          '409': '`SERVICE_IN_USE`: el servicio está asociado a reservas',
        }),
      },
    }),
  },

  '/api/reservations': {
    get: op({
      tags: ['Reservas'],
      summary: 'Listar reservas',
      description: noRole,
      parameters: [
        queryParam('page', 'Página (1-indexada)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Cantidad por página (default 10, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
        queryParam('status', 'Filtrar por estado, o `active` para PENDING+RESERVED+CHECKED_IN', {
          schema: { type: 'string', enum: ['active', 'RESERVED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] },
        }),
        queryParam('guestId', 'Filtrar por huésped', { schema: { type: 'integer' } }),
        queryParam('roomId', 'Filtrar por habitación', { schema: { type: 'integer' } }),
        queryParam('from', 'Solo reservas con checkOut posterior a `from` (YYYY-MM-DD)', { schema: { type: 'string', format: 'date' } }),
        queryParam('to', 'Solo reservas con checkIn anterior a `to` (YYYY-MM-DD)', { schema: { type: 'string', format: 'date' } }),
        queryParam('search', 'Búsqueda por código, huésped o número de habitación', { schema: { type: 'string' } }),
      ],
      responses: {
        '200': ok({ type: 'array', items: ref('Reservation') }, true),
        ...errors({
          '400': '`VALIDATION_ERROR`/`BAD_REQUEST`: el rango from/to es inválido',
        }),
      },
    }),
    post: op({
      tags: ['Reservas'],
      summary: 'Crear reserva',
      description:
        `${noRole} Acepta un anticipo (payment) en la misma operación, y/o puede generar el link de MercadoPago ` +
        'por el saldo (`generatePaymentLink`). Ver descripción ampliada en la portada.',
      requestBody: jsonBody(js(createReservationSchema, 'input'), 'Reserva a crear'),
      responses: {
        '201': ok(ref('Reservation'), 'Reserva creada'),
        ...errors({
          '400': '`VALIDATION_ERROR`/`CHECKIN_TOO_EARLY`',
          '404': '`NOT_FOUND`: habitación, tipo, servicio o huésped inexistente',
          '409': '`ROOM_OCCUPIED`: la habitación no está libre en el rango solicitado',
          '502': '`MP_ORDER_FAILED`: falló la creación de la orden de MercadoPago',
        }),
      },
    }),
  },

  '/api/reservations/{id}': {
    get: op({
      tags: ['Reservas'],
      summary: 'Obtener reserva',
      description: noRole,
      parameters: [pathIdParam('ID de la reserva')],
      responses: {
        '200': ok(ref('Reservation')),
        ...errors(),
      },
    }),
    patch: op({
      tags: ['Reservas'],
      summary: 'Actualizar reserva',
      description: `${noRole} Revalida disponibilidad si cambian fechas o habitación.`,
      parameters: [pathIdParam('ID de la reserva')],
      requestBody: jsonBody(js(updateReservationSchema, 'input'), 'Campos a actualizar'),
      responses: {
        '200': ok(ref('Reservation')),
        ...errors({
          '400': '`VALIDATION_ERROR`/`CHECKIN_TOO_EARLY`/`BAD_REQUEST`',
          '404': '`NOT_FOUND`',
          '409': '`ROOM_OCCUPIED` o `INVALID_STATE`',
        }),
      },
    }),
  },

  '/api/reservations/{id}/check-in': {
    post: op({
      tags: ['Reservas'],
      summary: 'Check-in',
      description: noRole,
      parameters: [pathIdParam('ID de la reserva')],
      responses: {
        '200': ok(ref('Reservation')),
        ...errors({
          '409': '`INVALID_STATE`: la reserva no está en estado RESERVED o PENDING',
        }),
      },
    }),
  },

  '/api/reservations/{id}/check-out': {
    post: op({
      tags: ['Reservas'],
      summary: 'Check-out',
      description: noRole,
      parameters: [pathIdParam('ID de la reserva')],
      responses: {
        '200': ok(ref('Reservation')),
        ...errors({
          '409': '`INVALID_STATE`: la reserva no está CHECKED_IN',
        }),
      },
    }),
  },

  '/api/reservations/{id}/cancel': {
    post: op({
      tags: ['Reservas'],
      summary: 'Cancelar reserva',
      description: `${noRole} Marca "refundEligible" según la regla de devolución (≥10 días hasta el check-in y monto pagado > 0).`,
      parameters: [pathIdParam('ID de la reserva')],
      responses: {
        '200': ok(ref('Reservation')),
        ...errors({
          '409': '`INVALID_STATE`: la reserva ya está CANCELLED o CHECKED_OUT',
        }),
      },
    }),
  },

  '/api/reservations/{id}/refund': {
    post: op({
      tags: ['Reservas'],
      summary: 'Marcar como reembolsada',
      description: `${noRole} Registra el reembolso de la reserva cancelada (backoffice).`,
      parameters: [pathIdParam('ID de la reserva')],
      responses: {
        '200': ok(ref('Reservation')),
        ...errors({
          '409': '`INVALID_STATE`: la reserva no es elegible para reembolso',
        }),
      },
    }),
  },

  '/api/reservations/{id}/payments': {
    post: op({
      tags: ['Reservas', 'Pagos'],
      summary: 'Registrar pago de la reserva',
      description: `${noRole} Registra un pago manual (efectivo, tarjeta o transferencia) contra la reserva.`,
      parameters: [pathIdParam('ID de la reserva')],
      requestBody: jsonBody(js(recordPaymentSchema, 'input'), 'Pago a registrar'),
      responses: {
        '201': {
          description: 'Pago registrado. Envelope: `{ data }`.',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { data: ref('Payment') } },
            },
          },
        },
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '409': '`INVALID_STATE`: la reserva está cancelada',
        }),
      },
    }),
  },

  '/api/reservations/{id}/mp/order': {
    post: op({
      tags: ['Reservas', 'MercadoPago'],
      summary: 'Generar o regenerar link de pago',
      description:
        `${noRole} Crea una orden de MercadoPago por el saldo pendiente (balance de la reserva). ` +
        'Si ya existe un link y no se pasa `regenerate`, devuelve el existente con `generated: false`.',
      parameters: [pathIdParam('ID de la reserva')],
      requestBody: jsonBody(js(regenerateSchema, 'input'), 'Opciones de regeneración', false),
      responses: {
        '200': {
          description: 'Operación exitosa. Envelope: `{ data }`.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: {
                    type: 'object',
                    properties: {
                      reservation: ref('Reservation'),
                      generated: { type: 'boolean', description: 'true si se creó/regeneró el link' },
                    },
                  },
                },
              },
            },
          },
        },
        ...errors({
          '404': '`NOT_FOUND` o `MP_NOT_CONNECTED`',
          '409': '`INVALID_STATE`: reserva cancelada, finalizada o sin saldo pendiente',
          '502': '`MP_ORDER_FAILED`: falló la orden en MercadoPago',
        }),
      },
    }),
  },

  '/api/payments/{id}': {
    delete: op({
      tags: ['Pagos'],
      summary: 'Eliminar pago',
      description: `${adminOnly} Elimina un pago registrado del hotel (sus reservas).`,
      parameters: [pathIdParam('ID del pago')],
      responses: {
        '204': empty('Pago eliminado sin contenido'),
        ...errors(),
      },
    }),
  },

  '/api/summary': {
    get: op({
      tags: ['Resumen'],
      summary: 'Resumen del hotel',
      description:
        `${noRole} Ocupación, ingresos y estado de reservas en el rango. ` +
        'Defaults: `from` = 1º del mes de hoy, `to` = hoy. `to` no puede ser anterior a `from`.',
      parameters: [
        queryParam('from', 'Inicio del rango YYYY-MM-DD', { schema: { type: 'string', format: 'date' } }),
        queryParam('to', 'Fin del rango YYYY-MM-DD', { schema: { type: 'string', format: 'date' } }),
      ],
      responses: {
        '200': ok(ref('Summary')),
        ...errors({
          '400': '`VALIDATION_ERROR`/`BAD_REQUEST`: el rango es inválido',
        }),
      },
    }),
  },

  '/api/calendar': {
    get: op({
      tags: ['Calendario'],
      summary: 'Calendario de ocupación',
      description:
        `${noRole} Grilla por habitación y día. Defaults: mes corriente. ` +
        'El rango no puede exceder 62 días.',
      parameters: [
        queryParam('from', 'Inicio YYYY-MM-DD', { schema: { type: 'string', format: 'date' } }),
        queryParam('to', 'Fin YYYY-MM-DD', { schema: { type: 'string', format: 'date' } }),
      ],
      responses: {
        '200': ok(ref('Calendar')),
        ...errors({
          '400': '`VALIDATION_ERROR`/`BAD_REQUEST`: rango inválido o mayor a 62 días',
        }),
      },
    }),
  },

  '/api/mp/connection': {
    get: op({
      tags: ['MercadoPago'],
      summary: 'Estado de la conexión de MercadoPago',
      description: noRole,
      responses: {
        '200': ok(ref('MpConnection')),
        ...errors(),
      },
    }),
    delete: op({
      tags: ['MercadoPago'],
      summary: 'Desconectar cuenta de MercadoPago',
      description: adminOnly,
      responses: {
        '204': empty('Cuenta desconectada'),
        ...errors({ '404': '`MP_NOT_CONNECTED`: no hay cuenta conectada' }),
      },
    }),
  },

  '/api/mp/auth-url': {
    post: op({
      tags: ['MercadoPago'],
      summary: 'Obtener URL de autorización OAuth',
      description: adminOnly,
      requestBody: jsonBody(js(authUrlSchema, 'input'), '`returnTo`: origen permitido al que volver tras el OAuth', false),
      responses: {
        '200': ok(ref('MpAuthorizationData')),
        ...errors({
          '400': '`VALIDATION_ERROR`: `returnTo` no está en la allowlist',
        }),
      },
    }),
  },

  '/api/mp/oauth/callback': {
    get: op({
      tags: ['MercadoPago'],
      summary: 'Callback de OAuth de MercadoPago',
      description:
        'Público. MercadoPago redirige acá tras autorizar. Devuelve un HTML que le pasa el resultado a la ' +
        'ventana que abrió el popup y la cierra.',
      security: publicSecurity,
      parameters: [
        {
          name: 'state',
          in: 'query',
          required: true,
          description: 'State firmado emitido por `POST /api/mp/auth-url`',
          schema: { type: 'string' },
        },
        {
          name: 'code',
          in: 'query',
          description: 'Código de autorización de MercadoPago',
          schema: { type: 'string' },
        },
        {
          name: 'error',
          in: 'query',
          description: 'Presente cuando el usuario denegó la autorización',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Página HTML de cierre de popup. El resultado viaja por `postMessage` y/o query string.',
          content: { 'text/html': { schema: { type: 'string' } } },
        },
        '500': errResponse('Error interno (`INTERNAL_ERROR`)'),
      },
    }),
  },

  '/api/mp/webhook': {
    post: op({
      tags: ['MercadoPago'],
      summary: 'Webhook de notificaciones',
      description:
        'Público. MercadoPago notifica acá los pagos (debés configurar `MP_NOTIFICATION_URL`). ' +
        'Validación de firma contra el header `x-signature` (requiere `MP_WEBHOOK_SECRET`). ' +
        'Idempotente por `data.transactions.payments[].id` (columna `Payment.reference` @unique).',
      security: publicSecurity,
      requestBody: {
        required: true,
        description: 'Payload crudo de MercadoPago (se registra igual aunque el importe no matchee; ver portada)',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: {
        '200': okPlain({ ok: { type: 'boolean', example: true } }, 'Notificación procesada'),
        '401': errResponse('`MP_WEBHOOK_INVALID_SIGNATURE`: firma inválida o con `ts` fuera de tolerancia'),
        '500': errResponse('`MP_WEBHOOK_SECRET_MISSING`/`INTERNAL_ERROR`'),
      },
    }),
  },

  '/api/integrations/instagram/auth/url': {
    get: op({
      tags: ['Instagram'],
      summary: 'Obtener URL de autorización OAuth de Instagram',
      description:
        ownerOrAdmin +
        ' El `companyId` es explícito y debe pertenecer al usuario autenticado (multi-tenant).',
      parameters: [
        queryParam('companyId', 'ID de la empresa (hotel) a conectar', {
          required: true,
          schema: { type: 'integer', format: 'int64' },
        }),
      ],
      responses: {
        '200': okPlain(
          { data: { type: 'object', properties: { url: { type: 'string', format: 'uri' } } } },
          'URL de autorización de Instagram. Envelope: `{ data: { url } }`.',
        ),
        ...errors({ '403': '`FORBIDDEN`: el usuario no es ADMIN u OWNER de esa empresa' }),
      },
    }),
  },

  '/api/integrations/instagram/status': {
    get: op({
      tags: ['Instagram'],
      summary: 'Estado de la conexión de Instagram',
      description: noRole,
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                connected: { type: 'boolean' },
                id: { type: 'string' },
                companyId: { type: 'integer', format: 'int64' },
                igBusinessAccountId: { type: 'string' },
                username: { type: 'string' },
                active: { type: 'boolean' },
                lastSyncAt: { type: ['string', 'null'], format: 'date-time' },
              },
            },
          },
          'Envelope: `{ data }`. `connected=false` cuando no hay cuenta vinculada.',
        ),
        ...errors(),
      },
    }),
  },

  '/api/integrations/instagram/sync': {
    post: op({
      tags: ['Instagram'],
      summary: 'Sincronizar conversaciones de Instagram',
      description:
        noRole +
        ' Consulta la Conversations API de Meta e importa el último mensaje de cada conversación. ' +
        'No emite eventos de Realtime; el cliente refresca la bandeja después de la respuesta. ' +
        'Rate limit: 20/min por IP.',
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                imported: { type: 'integer', example: 3 },
                conversations: { type: 'integer', example: 12 },
                syncedAt: { type: 'string', format: 'date-time' },
              },
            },
          },
          'Sincronización completada. Envelope: `{ data }`.',
        ),
        ...errors({
          '404': '`IG_NOT_CONNECTED`: no hay una cuenta de Instagram conectada',
          '409': '`CHANNEL_NOT_CONNECTED`: la cuenta no está activa',
          '429': 'Demasiadas solicitudes (`RATE_LIMIT_EXCEEDED`, 20/min por IP)',
          '501': '`CHANNEL_SYNC_UNSUPPORTED`: el canal no permite sincronizar',
          '502': '`CHANNEL_SYNC_FAILED`: Meta rechazó la consulta',
        }),
      },
    }),
  },

  '/api/integrations/instagram/connection': {
    delete: op({
      tags: ['Instagram'],
      summary: 'Desconectar cuenta de Instagram (borrado definitivo)',
      description:
        ownerOrAdmin +
        ' Desuscribe la cuenta de los webhooks de Meta (best-effort) y **borra definitivamente** la cuenta ' +
        'y, en cascada, todas sus conversaciones y mensajes. No se puede deshacer.',
      responses: {
        '204': empty('Cuenta desconectada'),
        ...errors({ '404': '`IG_NOT_CONNECTED`: no hay cuenta conectada' }),
      },
    }),
  },

  '/api/integrations/instagram/callback': {
    get: op({
      tags: ['Instagram'],
      summary: 'Callback de OAuth de Instagram',
      description:
        'Pǧblico. Meta redirige acǭ tras autorizar. Valida el `state` firmado, intercambia el `code` por un token ' +
        'de Instagram long-lived y guarda la conexión del hotel. Responde con un redirect 302 al frontend.',
      security: publicSecurity,
      parameters: [
        { name: 'code', in: 'query', description: 'C��digo de autorizaci��n de Meta', schema: { type: 'string' } },
        {
          name: 'state',
          in: 'query',
          required: true,
          description: 'State firmado emitido por `GET /api/integrations/instagram/auth/url`',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '302': { description: 'Redirige al frontend con `ok=1` o `ok=0&reason=...`' },
        '500': errResponse('Error interno (`INTERNAL_ERROR`)'),
      },
    }),
  },

  '/api/integrations/instagram/webhook': {
    get: op({
      tags: ['Instagram'],
      summary: 'Verificación del webhook de Instagram',
      description:
        'Público. Handshake de Meta: compara `hub.verify_token` con `INSTAGRAM_WEBHOOK_VERIFY_TOKEN` y, ' +
        'si `hub.mode` es `subscribe`, devuelve `hub.challenge` con 200. Responde text/plain.',
      security: publicSecurity,
      parameters: [
        {
          name: 'hub.mode',
          in: 'query',
          required: true,
          description: 'Debe ser `subscribe`',
          schema: { type: 'string', enum: ['subscribe'] },
        },
        {
          name: 'hub.verify_token',
          in: 'query',
          required: true,
          description: 'Token configurado en el dashboard de Meta',
          schema: { type: 'string' },
        },
        {
          name: 'hub.challenge',
          in: 'query',
          description: 'Valor que Meta espera recibir de vuelta',
          schema: { type: 'string' },
        },
      ],
      responses: {
        '200': {
          description: 'Verificación aceptada; el body es `hub.challenge` en texto plano',
          content: { 'text/plain': { schema: { type: 'string' } } },
        },
        '403': empty('`hub.mode` o `hub.verify_token` inválidos'),
      },
    }),
    post: op({
      tags: ['Canales'],
      summary: 'Webhook de eventos de Instagram',
      description:
        'Público. Meta notifica acá los mensajes y lecturas de la cuenta conectada. Verifica la firma ' +
        '`X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con `INSTAGRAM_APP_SECRET`), normaliza los ' +
        'eventos y los persiste como conversaciones/mensajes (idempotente por `mid`). Responde 200; 403 si ' +
        'la firma es inválida. Exento del rate limit global de escritura.',
      security: publicSecurity,
      requestBody: {
        required: true,
        description: 'Payload crudo del evento de Meta',
        content: { 'application/json': { schema: { type: 'object' } } },
      },
      responses: {
        '200': empty('Evento confirmado'),
        '403': empty('`X-Hub-Signature-256` ausente o inválida'),
      },
    }),
  },

  '/api/realtime/config': {
    get: op({
      tags: ['Realtime'],
      summary: 'Configuración de Realtime para la bandeja',
      description:
        noRole +
        ' Devuelve la URL y la clave pública de Supabase Realtime, el topic de la empresa (`company:<id>`) ' +
        'y un JWT firmado por el backend con el claim `company_id` para suscribirse al canal privado de la ' +
        'bandeja. El token expira en 1 hora. Si `SUPABASE_JWT_SECRET` no está configurado responde 503 ' +
        '`REALTIME_DISABLED` y la bandeja funciona con el polling de respaldo.',
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                key: { type: 'string' },
                topic: { type: 'string', example: 'company:1' },
                token: { type: 'string' },
                expiresIn: { type: 'integer', example: 3600 },
              },
            },
          },
          'Datos de conexión de Realtime. Envelope: `{ data }`.',
        ),
        ...errors({ '503': '`REALTIME_DISABLED`: falta `SUPABASE_JWT_SECRET`' }),
      },
    }),
  },

  '/api/conversations': {
    get: op({
      tags: ['Canales'],
      summary: 'Listar conversaciones de la bandeja',
      description:
        noRole +
        ' Devuelve las conversaciones de todos los canales conectados, ordenadas por último mensaje. ' +
        'Paginado por `page`/`pageSize`. Incluye `canReply` y `replyWindowEndsAt` (ventana de 24 h).',
      parameters: [
        queryParam('channel', 'Filtrar por canal', { schema: { type: 'string', enum: ['INSTAGRAM', 'FACEBOOK', 'AIRBNB'] } }),
        queryParam('q', 'Buscar por nombre o usuario del contacto', { schema: { type: 'string' } }),
        queryParam('unread', 'Solo conversaciones con no leídos', { schema: { type: 'boolean' } }),
        queryParam('page', 'Página (default 1)', { schema: { type: 'integer', minimum: 1 } }),
        queryParam('pageSize', 'Tamaño de página (default 20, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
      ],
      responses: {
        '200': ok(
          { type: 'array', items: { type: 'object', additionalProperties: true } },
          true,
        ),
        ...errors(),
      },
    }),
  },

  '/api/conversations/{id}/messages': {
    get: op({
      tags: ['Canales'],
      summary: 'Listar mensajes de una conversación',
      description: noRole + ' Orden cronológico ascendente. Usá `before` (id de mensaje) para paginar hacia atrás.',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID de la conversación', schema: { type: 'string' } },
        queryParam('before', 'ID de mensaje: devuelve los anteriores', { schema: { type: 'string' } }),
        queryParam('limit', 'Cantidad (default 50, máx 100)', { schema: { type: 'integer', minimum: 1, maximum: 100 } }),
      ],
      responses: {
        '200': {
          description: 'Operación exitosa. Envelope: `{ data, meta: { hasMore } }`.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  data: { type: 'array', items: { type: 'object', additionalProperties: true } },
                  meta: { type: 'object', properties: { hasMore: { type: 'boolean' } } },
                },
              },
            },
          },
        },
        ...errors({ '404': '`NOT_FOUND`: la conversación no existe en esta empresa' }),
      },
    }),
    post: op({
      tags: ['Canales'],
      summary: 'Responder en una conversación',
      description: noRole + ' Envía el texto por el canal. Falla si la ventana de 24 h expiró.',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID de la conversación', schema: { type: 'string' } },
      ],
      requestBody: jsonBody(
        {
          type: 'object',
          required: ['text'],
          properties: { text: { type: 'string', maxLength: 1000 } },
        },
        'Texto a enviar (hasta 1000 caracteres)',
      ),
      responses: {
        '201': okPlain({ data: { type: 'object', additionalProperties: true } }, 'Mensaje enviado. Envelope: `{ data }`.'),
        ...errors({
          '404': '`NOT_FOUND`: la conversación no existe en esta empresa',
          '409': '`CHANNEL_WINDOW_EXPIRED`, `CHANNEL_SEND_FAILED` o `CHANNEL_NOT_CONNECTED`',
          '502': '`CHANNEL_SEND_FAILED`: el proveedor rechazó el envío',
        }),
      },
    }),
  },

  '/api/conversations/{id}/read': {
    post: op({
      tags: ['Canales'],
      summary: 'Marcar conversación como leída',
      description: noRole,
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID de la conversación', schema: { type: 'string' } },
      ],
      responses: {
        '204': empty('Conversación marcada como leída'),
        ...errors({ '404': '`NOT_FOUND`: la conversación no existe en esta empresa' }),
      },
    }),
  },

  '/api/conversations/{id}/history': {
    post: op({
      tags: ['Canales'],
      summary: 'Importar historial de una conversación',
      description:
        noRole +
        ' Pide los últimos 20 mensajes al proveedor y los importa sin marcarlos como no leídos ni emitir Realtime. ' +
        'Usalo al abrir un hilo para completar lo que el webhook no trajo. Rate limit: 20/min por IP.',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID de la conversación', schema: { type: 'string' } },
      ],
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: { imported: { type: 'integer', example: 20 } },
            },
          },
          'Historial importado. Envelope: `{ data }`.',
        ),
        ...errors({
          '404': '`NOT_FOUND`: la conversación no existe en esta empresa',
          '409': '`CHANNEL_NOT_CONNECTED`: la cuenta del canal no está activa',
          '429': 'Demasiadas solicitudes (`RATE_LIMIT_EXCEEDED`, 20/min por IP)',
          '501': '`CHANNEL_HISTORY_UNSUPPORTED`: el canal no permite importar historial',
          '502': '`CHANNEL_HISTORY_FAILED`: el proveedor rechazó la consulta',
        }),
      },
    }),
  },

  '/api/ai/config': {
    get: op({
      tags: ['Asistente de IA'],
      summary: 'Estado del asistente de IA',
      description:
        noRole +
        ' Indica si el backend tiene `GEMINI_API_KEY` configurada. Sin ella los drafts responden 503 ' +
        '`AI_NOT_CONFIGURED` y el auto-reply no funciona.',
      responses: {
        '200': okPlain(
          { data: { type: 'object', properties: { configured: { type: 'boolean' } } } },
          'Estado del asistente. Envelope: `{ data }`.',
        ),
        ...errors(),
      },
    }),
  },

  '/api/ai/settings': {
    get: op({
      tags: ['Asistente de IA'],
      summary: 'Configuración del asistente de IA de la empresa',
      description: noRole + ' Devuelve los defaults (`enabled: false`, `autoReply: true`) si la empresa nunca configuró nada.',
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                autoReply: { type: 'boolean' },
                instructions: { type: 'string', nullable: true },
              },
            },
          },
          'Configuración actual. Envelope: `{ data }`.',
        ),
        ...errors(),
      },
    }),
    put: op({
      tags: ['Asistente de IA'],
      summary: 'Actualizar la configuración del asistente de IA',
      description: ownerOrAdmin + ' Upsert de la configuración de la empresa.',
      requestBody: jsonBody(
        {
          type: 'object',
          required: ['enabled', 'autoReply'],
          properties: {
            enabled: { type: 'boolean' },
            autoReply: { type: 'boolean' },
            instructions: { type: 'string', maxLength: 2000, nullable: true },
          },
        },
        'Nueva configuración',
      ),
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean' },
                autoReply: { type: 'boolean' },
                instructions: { type: 'string', nullable: true },
              },
            },
          },
          'Configuración guardada. Envelope: `{ data }`.',
        ),
        ...errors({ '403': '`FORBIDDEN`: requiere rol `OWNER` o `ADMIN`' }),
      },
    }),
  },

  '/api/conversations/{id}/ai/draft': {
    post: op({
      tags: ['Asistente de IA', 'Canales'],
      summary: 'Generar un borrador de respuesta con IA',
      description:
        noRole +
        ' Arma un borrador para la conversación con el historial y los servicios del hotel. ' +
        '`action: "auto"` significa que la respuesta puede enviarse tal cual; `suggest` requiere revisión. ' +
        'Si la ventana de 24 h está cerrada el borrador se genera igual (`canReply: false`). ' +
        'Rate limit: 10/min por IP.',
      parameters: [
        { name: 'id', in: 'path', required: true, description: 'ID de la conversación', schema: { type: 'string' } },
      ],
      responses: {
        '200': okPlain(
          {
            data: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['auto', 'suggest'] },
                reply: { type: 'string' },
                canReply: { type: 'boolean' },
              },
            },
          },
          'Borrador generado. Envelope: `{ data }`.',
        ),
        ...errors({
          '404': '`NOT_FOUND`: la conversación no existe en esta empresa',
          '409': '`AI_DISABLED`, `AI_NO_MESSAGES` o `CHANNEL_NOT_CONNECTED`',
          '429': 'Demasiadas solicitudes (`RATE_LIMIT_EXCEEDED`, 10/min por IP)',
          '502': '`AI_UPSTREAM_FAILED` o `AI_BAD_RESPONSE`: Gemini falló o devolvió algo ilegible',
          '503': '`AI_NOT_CONFIGURED`: falta `GEMINI_API_KEY` en el backend',
        }),
      },
    }),
  },

  '/api/auth/confirm-email': {
    get: op({
      tags: ['Autenticaci��n'],
      summary: 'Confirmar email',
      description:
        'P��blico. Endpoint al que Supabase Auth redirige (con `token_hash` y `type=email`) para confirmar la cuenta. ' +
        'Verifica el token contra GoTrue y responde JSON.',
      security: publicSecurity,
      parameters: [
        { name: 'token_hash', in: 'query', required: true, description: 'Hash del token de confirmaci��n', schema: { type: 'string' } },
        { name: 'type', in: 'query', required: true, description: 'Debe ser `email`', schema: { type: 'string', enum: ['email'] } },
      ],
      responses: {
        '200': okPlain({ message: { type: 'string', example: 'Email confirmado correctamente.' } }, 'Email confirmado'),
        '400': errResponse('Enlace invǭlido o incompleto'),
      },
    }),
  },

  '/api/auth/register': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Auto-registro de hotel',
      description:
        'Público. Crea la cuenta en Supabase Auth con `raw_user_meta_data` **sin** `company_id`: el trigger ' +
        '`sync_auth_user` crea una `Company` nueva + `UserType` OWNER + fila `User` en cuanto se confirma el email. ' +
        `Si \`REGISTER_KEY\` está configurada, exige \`key\` en el body (403 \`REGISTER_KEY_REQUIRED\`). ` +
        'Rate limit: 5 / 15 min por IP (compartido con `/resend-confirmation`).',
      security: publicSecurity,
      requestBody: jsonBody(js(registerSchema, 'input'), 'Email, contraseña, usuario y nombre del hotel'),
      responses: {
        '201': okPlain(
          { data: { type: 'object', properties: { sent: { type: 'boolean', example: true } } } },
          'Cuenta creada; la fila de app aparece al confirmar el email',
        ),
        ...errors({
          '400': '`VALIDATION_ERROR` o `WEAK_PASSWORD`',
          '403': '`REGISTER_KEY_REQUIRED`: falta la clave de registro',
          '409': '`DUPLICATE`: ya existe un hotel con ese nombre',
          '429': '`RATE_LIMIT_EXCEEDED` (5/15min por IP)',
        }),
      },
    }),
  },

  '/api/auth/resend-confirmation': {
    post: op({
      tags: ['Autenticación'],
      summary: 'Reenviar email de confirmación',
      description:
        'Público. Reenvía el email de confirmación de Supabase Auth (no revela si el email ya existe). ' +
        'Si `REGISTER_KEY` está configurada, exige `key` en el body (403 `REGISTER_KEY_REQUIRED`). ' +
        'Rate limit: 5 / 15 min por IP (compartido con `/register`).',
      security: publicSecurity,
      requestBody: jsonBody(js(resendSchema, 'input'), 'Email a confirmar'),
      responses: {
        '200': okPlain(
          { data: { type: 'object', properties: { sent: { type: 'boolean', example: true } } } },
          'Email reenviado',
        ),
        ...errors({
          '400': '`VALIDATION_ERROR`: email inválido',
          '403': '`REGISTER_KEY_REQUIRED`: falta la clave de registro',
          '429': '`RATE_LIMIT_EXCEEDED` (5/15min por IP)',
        }),
      },
    }),
  },

  '/api/users': {
    get: op({
      tags: ['Usuarios'],
      summary: 'Listar usuarios',
      description:
        `${ownerOrAdmin} El \`OWNER\` ve los usuarios que creó (cross-tenant); el \`ADMIN\` ve los recepcionistas de su hotel.`,
      responses: {
        '200': ok({ type: 'array', items: ref('UserRow') }),
        ...errors(),
      },
    }),
    post: op({
      tags: ['Usuarios'],
      summary: 'Crear usuario',
      description:
        `${ownerOrAdmin} El \`ADMIN\` solo puede crear \`RECEPCIONISTA\` en su hotel; el \`OWNER\` elige hotel entre los que creó. ` +
        'La cuenta va a Supabase Auth: si el email ya tiene cuenta (en otra empresa) se reusa y la contraseña se ignora.',
      requestBody: jsonBody(js(createUserSchema, 'input'), 'Datos del usuario a crear'),
      responses: {
        '201': ok(ref('UserRow'), 'Usuario creado'),
        ...errors({
          '400': '`VALIDATION_ERROR` o `BAD_REQUEST` (el OWNER debe elegir `companyId`)',
          '403': '`FORBIDDEN`: rol no habilitado para esta operación',
          '409': '`DUPLICATE`: ya existe un usuario con ese username en el hotel',
        }),
      },
    }),
  },
};

export const info = {
  title: 'API Gestión Hotel',
  version: '1.0.0',
  description: [
    '# API de Gestión Hotel (multi-tenant)',
    '',
    'Sistema hotelero multi-empresa: autenticación por cookie, moneda ARS, fechas en UTC.',
    '',
    '## Autenticación',
    'Login en 2 pasos: `POST /api/auth/login` devuelve las empresas del usuario; luego ' +
      '`POST /api/auth/login/company` emite la sesión en la cookie httpOnly `gh_token`. ',
    'Esta UI no guarda la cookie automáticamente: usá una herramienta de pruebas (curl/Postman) ' +
      'que la conserve y agregá en cada request el header `Cookie: gh_token=...` (o probá primero el login y copiá el valor).',
    '',
    '## Envelope',
    'Las respuestas exitosas van envueltas en `{ data, meta? }` (salvo auth y `/health`). ' +
      'Los errores siempre devuelven `{ error: { code, message, details? } }`.',
    '',
    '## Códigos de error',
    '- `VALIDATION_ERROR`, `BAD_REQUEST`, `INVALID_JSON` (400); `UNAUTHORIZED` (401); `FORBIDDEN`, `REGISTER_KEY_REQUIRED` (403); `NOT_FOUND`, `MP_NOT_CONNECTED` (404).',
    '- Conflicto (409): `DUPLICATE`, `TYPE_IN_USE`, `SERVICE_IN_USE`, `ROOM_HAS_RESERVATIONS`, `GUEST_EXISTS`, `INVALID_STATE`, `CHECKIN_TOO_EARLY`, `ROOM_OCCUPIED`.',
    '- `RATE_LIMIT_EXCEEDED` (429): estallás el bucket por IP. Headers: `RateLimit`, `RateLimit-Policy`, `Retry-After`.',
    '- MercadoPago: `MP_WEBHOOK_INVALID_SIGNATURE` (401), `MP_WEBHOOK_SECRET_MISSING` (500), `MP_ORDER_FAILED` (502).',
    '',
    '## Rate limits',
    '- Escrituras (POST/PUT/PATCH/DELETE): 60 / min por IP (global).',
    '- `POST /api/auth/login` y `/login/company`: 5 / 15 min por IP.',
    '- `POST /api/auth/register` y `/resend-confirmation`: 5 / 15 min por IP (bucket COMPARTIDO).',
    '- `GET /api/companies`: 30 / min por IP.',
    '',
    '## Anticipo y MercadoPago',
    '- Al crear una reserva podés registrar un anticipo (`payment`) y/o generar el link por el saldo (`generatePaymentLink`).',
    '- Con `payment.method=MERCADOPAGO` el pago NO se registra: el link cubre el anticipo y la reserva nace `PENDING`; el saldo se cobra en el hotel.',
    '- `POST /api/reservations/:id/mp/order` cobra siempre el saldo pendiente y rechaza (`INVALID_STATE`) si no queda nada.',
    '- El webhook valida el importe contra `mpExpectedAmount`; si no matchea registra igual el pago y loguea un warning.',
  ].join('\n'),
};

export const openApiDocument = {
  openapi: '3.1.0',
  info,
  servers: [
    { url: 'http://localhost:3000', description: 'Desarrollo local' },
    {
      url: 'https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws',
      description: 'Producción (Lambda)',
    },
  ],
  tags: [
    { name: 'Estado', description: 'Health check' },
    { name: 'Autenticación', description: 'Login de 2 pasos y sesión' },
    { name: 'Empresas', description: 'Hoteles (multi-tenant)' },
    { name: 'Tipos de habitación', description: 'Categorías de habitación' },
    { name: 'Habitaciones', description: 'Habitaciones y disponibilidad' },
    { name: 'Huéspedes', description: 'Clientes' },
    { name: 'Servicios', description: 'Servicios y cargos' },
    { name: 'Reservas', description: 'Reservas, check-in/out y cancelación' },
    { name: 'Pagos', description: 'Pagos manuales por reserva' },
    { name: 'Resumen', description: 'Métricas del hotel' },
    { name: 'Calendario', description: 'Ocupación por habitación/día' },
    { name: 'MercadoPago', description: 'OAuth, conexión, órdenes y webhook' },
    { name: 'Instagram', description: 'OAuth y conexión de Instagram Business' },
    { name: 'Canales', description: 'Bandeja unificada de mensajes (Instagram, Facebook, Airbnb)' },
    { name: 'Asistente de IA', description: 'Borradores y auto-respuesta de la bandeja con Gemini' },
    { name: 'Realtime', description: 'Conexión en tiempo real de la bandeja vía Supabase Realtime' },
    { name: 'Usuarios', description: 'Alta de usuarios y auto-registro' },
  ],
  components: {
    securitySchemes: {
      cookieAuth: {
        type: 'apiKey',
        in: 'cookie',
        name: 'gh_token',
        description: 'Cookie httpOnly emitida por `POST /api/auth/login/company`',
      },
    },
    schemas: componentSchemas,
  },
  paths,
  security: sessionSecurity,
};

export const publicOperations = PUBLIC.map(([path, method]) => ({ path, method }));