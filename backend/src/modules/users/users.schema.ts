import { z } from 'zod';
import { emailField } from '../../lib/validate.js';

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
  name: z.string().trim().min(1).max(100).optional(),
  email: emailField,
  role: z.enum(['ADMIN', 'RECEPCIONISTA']),
  companyId: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
