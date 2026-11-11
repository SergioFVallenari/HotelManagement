import { z } from 'zod';

export const guestPhoneSchema = z.union([z.string().trim().min(3).max(30), z.string().trim().length(0)])
  .nullable().optional().transform((value) => value === '' ? null : value);
export const guestEmailSchema = z.union([z.string().trim().email().max(200), z.string().trim().length(0)])
  .nullable().optional().transform((value) => value === '' ? null : value);

export const createGuestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: guestPhoneSchema,
  email: guestEmailSchema,
});

export const updateGuestSchema = createGuestSchema.partial();

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;
