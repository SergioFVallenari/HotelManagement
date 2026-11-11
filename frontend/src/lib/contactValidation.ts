import { z } from 'zod';

export const emailSchema = z.string().trim()
  .email('Ingresá un email válido.')
  .max(254, 'El email no puede superar los 254 caracteres.');

export const guestEmailSchema = emailSchema.max(200, 'El email no puede superar los 200 caracteres.');

export const phoneSchema = z.string().trim()
  .max(30, 'El teléfono no puede superar los 30 caracteres.')
  .regex(/^\+?[\d\s().-]+$/, 'Ingresá un teléfono válido, sin letras ni símbolos especiales.')
  .refine((value) => {
    const digits = value.replace(/\D/g, '').length;
    return digits >= 7 && digits <= 15;
  }, 'El teléfono debe tener entre 7 y 15 dígitos.');

function optionalContact(schema: z.ZodString) {
  return z.preprocess(
    (value) => typeof value === 'string' && !value.trim() ? null : value,
    schema.nullish(),
  )
    .transform((value) => value || null);
}

export const guestContactSchema = z.object({
  email: optionalContact(guestEmailSchema),
  phone: optionalContact(phoneSchema),
});

export const publicBookingContactSchema = guestContactSchema.extend({ phone: phoneSchema });

export const hotelContactSchema = z.object({
  phone: optionalContact(phoneSchema),
  whatsapp: optionalContact(phoneSchema),
});

export function validateContact<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues[0]?.message || 'Revisá los datos de contacto.');
  return result.data;
}
