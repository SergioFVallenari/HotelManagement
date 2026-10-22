import { z } from 'zod';
import { dateStringSchema, serviceInputSchema } from '../reservations/reservations.schema.js';

// Solicitud de reserva que prepara la recepcion y comparte por WhatsApp.
export const createBookingLinkSchema = z.object({
  roomId: z.number().int().positive(),
  checkIn: dateStringSchema,
  checkOut: dateStringSchema,
  persons: z.number().int().min(1).max(50).default(1),
  extraBeds: z.number().int().min(0).max(10).default(0),
  services: z.array(serviceInputSchema).default([]),
  // Anticipo manual: si no viene se calcula con el % del hotel.
  deposit: z.number().min(0).optional().nullable(),
  expiresInDays: z.number().int().min(1).max(90).optional(),
});

export const listBookingLinksQuerySchema = z.object({
  status: z.enum(['OPEN', 'COMPLETED', 'CANCELLED']).optional(),
});

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
