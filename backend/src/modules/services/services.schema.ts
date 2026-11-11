import { z } from 'zod';

export const serviceChargeTypeSchema = z.enum(['PER_PERSON', 'PER_DAY', 'PACK', 'PER_ROOM_INTERVAL']);

const serviceFields = z.object({
  name: z.string().min(1).max(100),
  description: z.string().trim().max(1000).nullable().optional(),
  intervalDays: z.number().int().min(1).max(365).nullable().optional(),
  price: z.number().min(0),
  chargeType: serviceChargeTypeSchema.default('PACK'),
  isExtraBed: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const createServiceSchema = serviceFields.superRefine((data, ctx) => {
  if (data.chargeType === 'PER_ROOM_INTERVAL') {
    if (data.intervalDays == null) ctx.addIssue({ code: 'custom', path: ['intervalDays'], message: 'Indicá cada cuántos días se realiza el servicio' });
    if (data.isExtraBed) ctx.addIssue({ code: 'custom', path: ['isExtraBed'], message: 'Una cama extra no puede cobrarse por intervenciones' });
  } else if (data.intervalDays != null) ctx.addIssue({ code: 'custom', path: ['intervalDays'], message: 'La frecuencia solo corresponde al cobro por habitación e intervención' });
});

export const updateServiceSchema = serviceFields.partial();

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
