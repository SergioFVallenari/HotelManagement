import { z } from 'zod';

const optionalText = z.string().trim().max(200).nullable();
export const aiGuestEmailSchema = z.string().email();
const realDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Fecha inexistente');

export const reservationChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().trim().min(1).max(6000) })).min(1).max(30),
}).refine((value) => value.messages.at(-1)?.role === 'user', 'El último mensaje debe ser del usuario');

export const reservationIntentSchema = z.object({
  question: z.string().max(1000).nullable(),
  checkIn: realDate.nullable(),
  checkOut: realDate.nullable(),
  firstName: optionalText,
  lastName: optionalText,
  phone: optionalText,
  email: optionalText,
  guestId: z.number().int().positive().nullable().default(null),
  newGuest: z.boolean().default(false),
  rooms: z.array(z.object({
    number: optionalText,
    type: optionalText,
    persons: z.number().int().min(1).max(100),
    extraBeds: z.number().int().min(0).max(10),
  })).max(20),
  services: z.array(z.object({ name: z.string().min(1).max(200), quantity: z.number().int().min(1).max(1000) })).max(30),
  notes: z.string().max(500).nullable(),
});

export const confirmAiReservationSchema = z.object({ token: z.string().min(1).max(30000) });
export type ReservationIntent = z.infer<typeof reservationIntentSchema>;

const nullableString = { type: 'string', nullable: true };
export const reservationIntentResponseSchema = {
  type: 'object',
  properties: {
    question: nullableString,
    checkIn: nullableString,
    checkOut: nullableString,
    firstName: nullableString,
    lastName: nullableString,
    phone: nullableString,
    email: nullableString,
    guestId: { type: 'integer', nullable: true },
    newGuest: { type: 'boolean' },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: { number: nullableString, type: nullableString, persons: { type: 'integer' }, extraBeds: { type: 'integer' } },
        required: ['number', 'type', 'persons', 'extraBeds'],
      },
    },
    services: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, quantity: { type: 'integer' } },
        required: ['name', 'quantity'],
      },
    },
    notes: nullableString,
  },
  required: ['question', 'checkIn', 'checkOut', 'firstName', 'lastName', 'phone', 'email', 'guestId', 'newGuest', 'rooms', 'services', 'notes'],
};
