import { z } from 'zod';
import { dateStringSchema, serviceInputSchema, roomSelectionsSchema } from '../reservations/reservations.schema.js';

// Solicitud de reserva que prepara la recepcion y comparte por WhatsApp.
export const createBookingLinkSchema = z.object({
  roomId: z.number().int().positive().optional(),
  rooms: roomSelectionsSchema.optional(),
  checkIn: dateStringSchema,
  checkOut: dateStringSchema,
  persons: z.number().int().min(1).default(1),
  extraBeds: z.number().int().min(0).default(0),
  services: z.array(serviceInputSchema).default([]),
  // Anticipo manual: si no viene se calcula con el % del hotel.
  deposit: z.number().min(0).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
}).refine((data) => data.roomId !== undefined || data.rooms !== undefined, { message: 'Seleccioná al menos una habitación', path: ['rooms'] });

export const listBookingLinksQuerySchema = z.object({
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
});

export const publicAvailabilityQuerySchema = z.object({
  checkIn: dateStringSchema,
  checkOut: dateStringSchema,
  persons: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  roomCount: z.coerce.number().int().min(1).max(100).optional(),
  includeExtraBeds: z.enum(['true', 'false']).transform((value) => value === 'true').optional().default(false),
  roomPersons: z.string().max(2000).regex(/^\d+(,\d+)*$/, 'La distribución debe contener cantidades de personas separadas por comas')
    .transform((value) => value.split(',').map(Number))
    .pipe(z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).min(1).max(100)).optional(),
}).superRefine((data, ctx) => {
  if (!Array.isArray(data.roomPersons)) return;
  if (data.roomCount !== data.roomPersons.length) ctx.addIssue({ code: 'custom', path: ['roomPersons'], message: 'La distribución debe coincidir con la cantidad de habitaciones' });
  if (data.roomPersons.reduce((sum, count) => sum + count, 0) !== data.persons) ctx.addIssue({ code: 'custom', path: ['roomPersons'], message: 'La suma de personas por habitación debe coincidir con el total' });
});

export type PublicAvailabilityQuery = z.infer<typeof publicAvailabilityQuerySchema>;

export const bookingRoomSnapshotsSchema = z.array(z.object({
  roomId: z.number().int().positive(),
  persons: z.number().int().positive(),
  extraBeds: z.number().int().min(0),
  roomPrice: z.number().nonnegative(),
  roomPricingMode: z.enum(['PER_NIGHT', 'PER_PERSON']),
  number: z.string(),
  typeName: z.string(),
  capacity: z.number().int().positive(),
  amenities: z.array(z.string()).optional(),
}));

// Paso 1 del formulario publico: el huesped pide una URL firmada para subir el
// comprobante directo a Supabase Storage.
export const receiptUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(100),
  size: z.number().int().positive(),
});

// Paso 2: datos del huesped + el path que devolvio el paso 1.
export const publicBookingSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(3).max(30),
  email: z.string().trim().email().max(200),
  notes: z.string().trim().max(500).optional().nullable(),
  // Referencia de la transferencia (la escribe el huesped).
  externalRef: z.string().trim().max(100).optional().nullable(),
  receiptPath: z.string().trim().max(300).optional().nullable(),
  receiptFileName: z.string().trim().max(200).optional().nullable(),
});

export const rejectReservationSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

export type CreateBookingLinkInput = z.infer<typeof createBookingLinkSchema>;
export type ListBookingLinksQuery = z.infer<typeof listBookingLinksQuerySchema>;
export type ReceiptUploadInput = z.infer<typeof receiptUploadSchema>;
export type PublicBookingInput = z.infer<typeof publicBookingSchema>;
