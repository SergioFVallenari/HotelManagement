import { z } from 'zod';

export const createRoomSchema = z.object({
  number: z.string().min(1).max(20),
  name: z.string().max(100).optional().nullable(),
  typeId: z.number().int().positive(),
  capacity: z.number().int().min(1).max(50).default(2),
  maxExtraBeds: z.number().int().min(0).max(10).default(0),
  price: z.number().min(0).default(0),
  amenities: z.array(z.string().min(1).max(100)).default([]),
  isActive: z.boolean().default(true),
});

export const updateRoomSchema = createRoomSchema.partial();

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;