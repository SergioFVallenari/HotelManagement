import { z } from 'zod';

export const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (se espera YYYY-MM-DD)');

export const guestInputSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(3).max(30),
  email: z.string().email().max(200),
});

export const serviceInputSchema = z.object({
  serviceId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(100).default(1),
});

export const createReservationSchema = z
  .object({
    roomId: z.number().int().positive(),
    guestId: z.number().int().positive().optional(),
    guest: guestInputSchema.optional(),
    checkIn: dateStringSchema,
    checkOut: dateStringSchema,
    services: z.array(serviceInputSchema).default([]),
    notes: z.string().max(500).optional().nullable(),
  })
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
    guestId: z.number().int().positive().optional(),
    guest: guestInputSchema.optional(),
    checkIn: dateStringSchema.optional(),
    checkOut: dateStringSchema.optional(),
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