import { z } from 'zod';

export const serviceChargeTypeSchema = z.enum(['PER_PERSON', 'PER_DAY', 'PACK']);

export const createServiceSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.number().min(0),
  chargeType: serviceChargeTypeSchema.default('PACK'),
  isActive: z.boolean().default(true),
});

export const updateServiceSchema = createServiceSchema.partial();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;