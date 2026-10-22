import { z } from 'zod';

export const getAuthUrlSchema = z.object({
  companyId: z.coerce.number().int().positive(),
});

export type GetAuthUrlInput = z.infer<typeof getAuthUrlSchema>;
