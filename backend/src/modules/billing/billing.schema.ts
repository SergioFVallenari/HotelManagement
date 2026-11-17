import { z } from 'zod';

export const updateCoverageSchema = z.object({
  companyIds: z.array(z.number().int().positive()).max(3).refine((ids) => new Set(ids).size === ids.length, 'No repitas hoteles'),
}).strict();

export const checkoutSchema = z.object({
  payerEmail: z.string().trim().max(254).email('Ingresá un email válido de Mercado Pago'),
}).strict();
