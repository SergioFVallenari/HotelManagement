import { z } from 'zod';
import { isEmail } from '../../lib/validate.js';

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
