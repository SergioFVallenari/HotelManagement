import { z } from 'zod';
import * as schemas from './schemas.js';
import { credentialsSchema, loginSchema, switchCompanySchema } from '../modules/auth/auth.schema.js';
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
import { sendCodeSchema, registerSchema, createUserSchema } from '../modules/users/users.schema.js';
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
  ['/api/users/send-code', 'post'],
  ['/api/users/register', 'post'],
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
  CreatedUser: js(schemas.createdUserSchema),
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
      summary: 'Paso 1: credenciales por empresa',
      description:
        'Público. Busca el username en todas las empresas y devuelve las que matchean la contraseña. ' +
        'Paso previo a `POST /api/auth/login/company`. Rate limit: 5 intentos / 15 min por IP.',
      security: publicSecurity,
      requestBody: jsonBody(js(credentialsSchema, 'input'), 'Usuario y contraseña'),
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
          },
          'Lista de empresas del usuario (sin envelope `data`)',
        ),
        ...errors({
          '400': 'Datos inválidos (`VALIDATION_ERROR`)',
          '401': 'Credenciales inválidas (`UNAUTHORIZED`)',
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
        'Público. Valida la contraseña contra la empresa elegida y emite la sesión en la cookie `httpOnly` `gh_token`. ' +
        'Rate limit: 5 intentos / 15 min por IP.',
      security: publicSecurity,
      requestBody: jsonBody(
        js(loginSchema, 'input'),
        '`companyId` del paso 1 + usuario y contraseña',
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

  '/api/users/send-code': {
    post: op({
      tags: ['Usuarios'],
      summary: 'Enviar código de verificación por email',
      description:
        `Público. Paso 1 del auto-registro. Si \`REGISTER_KEY\` está configurada, exige \`key\` en el body (403 \`REGISTER_KEY_REQUIRED\`). ` +
        'Rate limits: 5 / 15 min por IP (compartido con /register) y 3 / hora por email e IP.',
      security: publicSecurity,
      requestBody: jsonBody(js(sendCodeSchema, 'input'), 'Email al que se envía el código'),
      responses: {
        '200': okPlain({ data: { type: 'object', properties: { sent: { type: 'boolean', example: true } } } }, 'Código enviado'),
        ...errors({
          '400': '`VALIDATION_ERROR`: email inválido',
          '403': '`REGISTER_KEY_REQUIRED`: falta la clave de registro',
          '429': '`RATE_LIMIT_EXCEEDED` (5/15min por IP) o `RATE_LIMIT` (3/hora por email o IP)',
          '500': '`MAIL_NOT_CONFIGURED` (prod sin SMTP) o `MAIL_ERROR`',
        }),
      },
    }),
  },

  '/api/users/register': {
    post: op({
      tags: ['Usuarios'],
      summary: 'Auto-registro de hotel',
      description:
        `Público. Paso 2: crea una \`Company\` nueva + usuario \`OWNER\`. ` +
        `Exige el código recibido por email y, si \`REGISTER_KEY\` está configurada, \`key\` en el body.`,
      security: publicSecurity,
      requestBody: jsonBody(js(registerSchema, 'input'), 'Email + código + datos del usuario'),
      responses: {
        '201': ok(ref('CreatedUser'), 'Hotel y propietario creados'),
        ...errors({
          '400': '`VALIDATION_ERROR` o `INVALID_CODE`: código inválido/expirado (hasta 5 intentos)',
          '403': '`REGISTER_KEY_REQUIRED`: falta la clave de registro',
          '409': '`DUPLICATE`: ya existe un hotel con ese nombre',
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
        `${ownerOrAdmin} El \`ADMIN\` solo puede crear \`RECEPCIONISTA\` en su hotel; el \`OWNER\` elige hotel entre los que creó.`,
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
    '- MercadoPago: `MP_WEBHOOK_INVALID_SIGNATURE` (401, `MP_WEBHOOK_SECRET_MISSING`/`MAIL_NOT_CONFIGURED`/`MAIL_ERROR` (500), `MP_ORDER_FAILED` (502).',
    '',
    '## Rate limits',
    '- Escrituras (POST/PUT/PATCH/DELETE): 60 / min por IP (global).',
    '- `POST /api/auth/login` y `/login/company`: 5 / 15 min por IP.',
    '- `POST /api/users/send-code` y `/register`: 5 / 15 min por IP (bucket COMPARTIDO) + 3 / hora por email e IP.',
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