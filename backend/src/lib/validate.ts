import { z } from 'zod';

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(200)
  .refine(isEmail, 'Email inválido');
