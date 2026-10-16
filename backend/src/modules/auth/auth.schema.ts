import { z } from 'zod';

export const credentialsSchema = z.object({
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const loginSchema = z.object({
  companyId: z.number().int().positive(),
  username: z.string().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const switchCompanySchema = z.object({
  companyId: z.number().int().positive(),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchCompanyInput = z.infer<typeof switchCompanySchema>;