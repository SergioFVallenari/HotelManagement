import { z } from 'zod';

const dateTime = () => z.string().describe('Fecha y hora ISO 8601 en UTC (p. ej. 2026-10-07T14:30:00.000Z)');
const dateOnly = () => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato YYYY-MM-DD').describe('Fecha YYYY-MM-DD');
const money = () => z.number().describe('Importe en ARS con hasta 2 decimales (nunca float)');

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'RECEPCIONISTA']);
export const reservationStatusSchema = z.enum([
  'PENDING',
  'RESERVED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
]);
export const paymentMethodSchema = z.enum(['CASH', 'CARD', 'TRANSFER', 'MERCADOPAGO']);
export const serviceChargeTypeSchema = z.enum(['PER_PERSON', 'PER_DAY', 'PACK']);

export const metaSchema = z.object({
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
});

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export const companySchema = z.object({
  id: z.number().int(),
  name: z.string(),
});

export const authUserSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  role: roleSchema,
  name: z.string().nullable(),
  email: z.string().nullable().optional(),
  companyId: z.number().int(),
});

export const roomTypeSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  companyId: z.number().int(),
  _count: z.object({ rooms: z.number().int() }).optional(),
});

export const roomSchema = z.object({
  id: z.number().int(),
  number: z.string(),
  name: z.string().nullable(),
  typeId: z.number().int(),
  companyId: z.number().int(),
  capacity: z.number().int(),
  maxExtraBeds: z.number().int(),
  price: money(),
  amenities: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: dateTime(),
  updatedAt: dateTime(),
  type: roomTypeSchema.nullable().optional(),
  _count: z.object({ reservations: z.number().int() }).optional(),
});

export const guestSchema = z.object({
  id: z.number().int(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string(),
  companyId: z.number().int(),
  createdAt: dateTime(),
  updatedAt: dateTime(),
  _count: z.object({ reservations: z.number().int() }).optional(),
});

export const guestDetailReservationSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  roomId: z.number().int(),
  guestId: z.number().int(),
  checkIn: dateOnly(),
  checkOut: dateOnly(),
  persons: z.number().int(),
  extraBeds: z.number().int(),
  status: reservationStatusSchema,
  checkedInAt: dateTime().nullable(),
  checkedOutAt: dateTime().nullable(),
  cancelledAt: dateTime().nullable(),
  refundEligible: z.boolean(),
  refundAmount: money().nullable(),
  refunded: z.boolean(),
  refundedAt: dateTime().nullable(),
  notes: z.string().nullable(),
  createdAt: dateTime(),
  updatedAt: dateTime(),
  room: z
    .object({
      id: z.number().int(),
      number: z.string(),
      name: z.string().nullable(),
    })
    .nullable(),
  services: z.array(
    z.object({
      id: z.number().int(),
      reservationId: z.number().int(),
      serviceId: z.number().int(),
      quantity: z.number().int(),
      personsCovered: z.number().int().nullable(),
      unitPrice: money(),
      service: z.object({ id: z.number().int(), name: z.string() }),
    }),
  ),
});

export const guestDetailSchema = guestSchema.extend({
  reservations: z.array(guestDetailReservationSchema),
});

export const serviceSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  price: money(),
  chargeType: serviceChargeTypeSchema,
  isExtraBed: z.boolean(),
  isActive: z.boolean(),
  companyId: z.number().int(),
  createdAt: dateTime(),
  _count: z.object({ reservations: z.number().int() }).optional(),
});

export const paymentSchema = z.object({
  id: z.number().int(),
  reservationId: z.number().int().optional(),
  amount: money(),
  method: paymentMethodSchema,
  paidAt: dateTime(),
  reference: z.string().nullable(),
});

export const reservationRoomSchema = z
  .object({
    id: z.number().int(),
    number: z.string(),
    name: z.string().nullable(),
    capacity: z.number().int(),
    price: money(),
    type: z.object({ id: z.number().int(), name: z.string() }).optional(),
  })
  .nullable();

export const reservationGuestSchema = z
  .object({
    id: z.number().int(),
    firstName: z.string(),
    lastName: z.string(),
    phone: z.string(),
    email: z.string(),
  })
  .nullable();

export const reservationServicesSchema = z.array(
  z.object({
    id: z.number().int(),
    serviceId: z.number().int(),
    name: z.string().nullable(),
    chargeType: serviceChargeTypeSchema.nullable(),
    isExtraBed: z.boolean(),
    personsCovered: z.number().int().nullable(),
    quantity: z.number().int(),
    unitPrice: money(),
    lineTotal: money(),
  }),
);

export const reservationTotalsSchema = z.object({
  nights: z.number().int(),
  roomPrice: money(),
  roomTotal: money(),
  servicesTotal: money(),
  total: money(),
  amountPaid: money(),
  balance: money(),
});

export const reservationSchema = z.object({
  id: z.number().int(),
  code: z.string(),
  roomId: z.number().int(),
  guestId: z.number().int(),
  checkIn: dateOnly(),
  checkOut: dateOnly(),
  persons: z.number().int(),
  extraBeds: z.number().int(),
  status: reservationStatusSchema,
  checkedInAt: dateTime().nullable(),
  checkedOutAt: dateTime().nullable(),
  cancelledAt: dateTime().nullable(),
  refundEligible: z.boolean(),
  refundAmount: money().nullable(),
  refunded: z.boolean(),
  refundedAt: dateTime().nullable(),
  mpCheckoutUrl: z.string().nullable(),
  mpExpectedAmount: money().nullable(),
  notes: z.string().nullable(),
  createdAt: dateTime(),
  updatedAt: dateTime(),
  room: reservationRoomSchema,
  guest: reservationGuestSchema,
  services: reservationServicesSchema,
  payments: z.array(paymentSchema),
  totals: reservationTotalsSchema,
});

export const userRowSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  name: z.string().nullable(),
  email: z.string(),
  isActive: z.boolean(),
  createdAt: dateTime().optional(),
  role: roleSchema,
  companyName: z.string(),
});

export const mpConnectionSchema = z.union([
  z.object({ connected: z.literal(false) }),
  z.object({
    connected: z.literal(true),
    mpUserId: z.string(),
    mpEmail: z.string().nullable(),
    connectedAt: dateTime(),
    lastRefreshedAt: dateTime(),
  }),
]);

export const mpAuthorizationDataSchema = z.object({
  url: z.string().describe('URL de autorización OAuth de MercadoPago (incluye el state firmado)'),
});

export const summarySchema = z.object({
  range: z.object({
    from: dateOnly(),
    to: dateOnly(),
    days: z.number().int(),
  }),
  occupancy: z.object({
    occupancyPct: money(),
    occupiedRoomNights: z.number().int(),
    availableRoomNights: z.number().int(),
    totalRoomNights: z.number().int(),
  }),
  revenue: z.object({
    total: money(),
    byMethod: z.record(paymentMethodSchema, money()),
  }),
  reservationsPage: z.object({
    created: z.number().int(),
    checkIns: z.number().int(),
    checkOuts: z.number().int(),
  }),
  statusDistribution: z.array(
    z.object({ status: reservationStatusSchema, count: z.number().int() }),
  ),
  daily: z.array(
    z.object({
      date: dateOnly(),
      revenue: money(),
      created: z.number().int(),
      checkIns: z.number().int(),
      checkOuts: z.number().int(),
      occupiedRoomNights: z.number().int(),
      occupancyPct: money(),
    }),
  ),
});

export const cellStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'TURNOVER']);

export const calendarSchema = z.object({
  from: dateOnly(),
  to: dateOnly(),
  days: z.array(z.string().describe('Fecha YYYY-MM-DD')),
  rooms: z.array(
    z.object({
      id: z.number().int(),
      number: z.string(),
      name: z.string().nullable(),
      typeName: z.string().nullable(),
      cells: z.array(
        z.object({
          status: cellStatusSchema,
          reservations: z.array(
            z.object({
              id: z.number().int(),
              code: z.string(),
              status: reservationStatusSchema,
              checkIn: dateOnly(),
              checkOut: dateOnly(),
              guestName: z.string(),
            }),
          ),
        }),
      ),
    }),
  ),
});

export const availableRoomsMetaSchema = z.object({
  checkIn: dateOnly(),
  checkOut: dateOnly(),
  total: z.number().int(),
});