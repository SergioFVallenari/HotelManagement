import { z } from 'zod';
import { emailField } from '../../lib/validate.js';

export const credentialsSchema = z.object({
  email: emailField,
  password: z.string().min(1).max(200),
});

export const loginSchema = z.object({
  companyId: z.number().int().positive(),
  token: z.string().min(1),
});

export const registerSchema = z.object({
  email: emailField,
  password: z.string().min(6).max(200),
  username: z.string().trim().min(3).max(50),
  name: z.string().trim().min(1).max(100).optional(),
  hotelName: z.string().trim().min(1).max(100).default('Hotel Principal'),
});

export const resendSchema = z.object({
  email: emailField,
});

export const switchCompanySchema = z.object({
  companyId: z.number().int().positive(),
});

export type CredentialsInput = z.infer<typeof credentialsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type ResendInput = z.infer<typeof resendSchema>;
export type SwitchCompanyInput = z.infer<typeof switchCompanySchema>;
