import { z } from 'zod';

export const createGuestSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().min(3).max(30),
  email: z.string().email().max(200),
});

export const updateGuestSchema = createGuestSchema.partial();

export type CreateGuestInput = z.infer<typeof createGuestSchema>;
export type UpdateGuestInput = z.infer<typeof updateGuestSchema>;