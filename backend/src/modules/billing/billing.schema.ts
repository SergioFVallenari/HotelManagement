import { z } from 'zod';

export const updateCoverageSchema = z.object({
  companyIds: z.array(z.number().int().positive()).max(3).refine((ids) => new Set(ids).size === ids.length, 'No repitas hoteles'),
}).strict();
