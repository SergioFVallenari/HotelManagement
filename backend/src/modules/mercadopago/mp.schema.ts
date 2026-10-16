import { z } from 'zod';
import { env } from '../../config/env.js';
import { isAllowedReturnTo } from './mp.return-to.js';

export const authUrlSchema = z.object({
  returnTo: z.string().refine((value) => isAllowedReturnTo(value, env.corsOrigins), 'returnTo inválido'),
});

export const regenerateSchema = z.object({
  regenerate: z.boolean().default(false),
});

export type AuthUrlInput = z.infer<typeof authUrlSchema>;
export type RegenerateInput = z.infer<typeof regenerateSchema>;