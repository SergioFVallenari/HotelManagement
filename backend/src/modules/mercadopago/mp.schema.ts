import { z } from 'zod';

export const authUrlSchema = z.object({
  returnTo: z.string().regex(/^(https?:\/\/[^/]+|capacitor:\/\/[^/]+)$/, 'returnTo inválido'),
});

export const regenerateSchema = z.object({
  regenerate: z.boolean().default(false),
});

export type AuthUrlInput = z.infer<typeof authUrlSchema>;
export type RegenerateInput = z.infer<typeof regenerateSchema>;