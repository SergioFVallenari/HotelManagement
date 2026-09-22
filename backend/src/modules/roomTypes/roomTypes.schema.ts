import { z } from 'zod';

export const createRoomTypeSchema = z.object({
  name: z.string().min(1).max(50),
});

export const updateRoomTypeSchema = createRoomTypeSchema.partial();

export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;