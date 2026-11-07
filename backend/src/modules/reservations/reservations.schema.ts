import { z } from 'zod';
import { createGuestSchema } from '../guests/guests.schema.js';

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (se espera YYYY-MM-DD)');

export const guestInputSchema = createGuestSchema;
export const discountSchema = z.object({
  type: z.enum(['PERCENTAGE', 'FIXED']),
  value: z.number().nonnegative().max(99999999.99).refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.00001, 'Usá como máximo dos decimales'),
}).refine((discount) => discount.type !== 'PERCENTAGE' || discount.value <= 100, 'El porcentaje no puede superar el 100%');

export const serviceInputSchema = z.object({
  serviceId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).default(1),
  personsCovered: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).optional().nullable(),
});

export const depositInputSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER', 'MERCADOPAGO']),
  reference: z.string().max(100).optional().nullable(),
});

export const roomSelectionSchema = z.object({
  roomId: z.number().int().positive(),
  persons: z.number().int().min(1),
  extraBeds: z.number().int().min(0).default(0),
});

export const roomSelectionsSchema = z.array(roomSelectionSchema).min(1).max(100).refine(
  (rooms) => new Set(rooms.map((room) => room.roomId)).size === rooms.length,
  'No se puede seleccionar dos veces la misma habitación',
);

export const createReservationSchema = z
  .object({
    roomId: z.number().int().positive().optional(),
    rooms: roomSelectionsSchema.optional(),
    guestId: z.number().int().positive().optional(),
    guest: guestInputSchema.optional(),
    checkIn: dateStringSchema,
    checkOut: dateStringSchema,
    persons: z.number().int().min(1).default(1),
    extraBeds: z.number().int().min(0).default(0),
    services: z.array(serviceInputSchema).default([]),
    notes: z.string().max(500).optional().nullable(),
    generatePaymentLink: z.boolean().optional(),
    payment: depositInputSchema.optional(),
    discount: discountSchema.optional(),
  })
  .refine((data) => data.roomId !== undefined || data.rooms !== undefined, { message: 'Seleccioná al menos una habitación', path: ['rooms'] })
  .refine((data) => data.guestId !== undefined || data.guest !== undefined, {
    message: 'Debe indicar guestId o datos del huésped',
    path: ['guest'],
  })
  .refine((data) => !(data.guestId !== undefined && data.guest !== undefined), {
    message: 'Indique guestId o datos del huésped, no ambos',
    path: ['guest'],
  });

export const updateReservationSchema = z
  .object({
    roomId: z.number().int().positive().optional(),
    rooms: roomSelectionsSchema.optional(),
    guestId: z.number().int().positive().optional(),
    guest: guestInputSchema.optional(),
    checkIn: dateStringSchema.optional(),
    checkOut: dateStringSchema.optional(),
    persons: z.number().int().min(1).optional(),
    extraBeds: z.number().int().min(0).optional(),
    services: z.array(serviceInputSchema).optional(),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((data) => !(data.guestId !== undefined && data.guest !== undefined), {
    message: 'Indique guestId o datos del huésped, no ambos',
    path: ['guest'],
  });

export const statusQuerySchema = z
  .string()
  .regex(/^(RESERVED|CHECKED_IN|CHECKED_OUT|CANCELLED)$/)
  .optional();

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;
