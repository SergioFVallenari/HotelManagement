import { z } from 'zod';
import { isEmail } from './users.code.js';

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(200)
  .refine(isEmail, 'Email inválido');

export const sendCodeSchema = z.object({
  email: emailField,
});

export const registerSchema = z.object({
  email: emailField,
  code: z.string().regex(/^\d{6}$/, 'El código debe tener 6 dígitos'),
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
  name: z.string().trim().min(1).max(100).optional(),
  hotelName: z.string().trim().min(1).max(100).default('Hotel Principal'),
});

export const createUserSchema = z.object({
  username: z.string().trim().min(3).max(50),
  password: z.string().min(6).max(200),
  name: z.string().trim().min(1).max(100).optional(),
  email: emailField.optional(),
  role: z.enum(['ADMIN', 'RECEPCIONISTA']),
  companyId: z.number().int().positive().optional(),
  isActive: z.boolean().default(true),
});

export type SendCodeInput = z.infer<typeof sendCodeSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
