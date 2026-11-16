import { z } from 'zod';

export const mobileSessionSchema = z.object({
  id: z.number().int().positive(),
  username: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'RECEPCIONISTA']),
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  companyId: z.number().int().positive(),
  companyName: z.string(),
});

export const mobileRefreshSchema = z.object({
  refreshToken: z.string().regex(/^[A-Za-z0-9_-]{64}$/, 'Refresh token inválido'),
});
