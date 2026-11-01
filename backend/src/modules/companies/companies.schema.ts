import { z } from 'zod';

const bookingThemeSchema = z.object({
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  text: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
}).strict();

export const publicPageConfigSchema = z.object({
  bookingTheme: bookingThemeSchema,
  maxAvailabilityPersons: z.number().int().positive().nullable().optional(),
  publicExtraBeds: z.object({
    enabled: z.boolean(),
    serviceId: z.number().int().positive().nullable(),
  }).strict().refine((value) => !value.enabled || value.serviceId !== null, { message: 'Seleccioná un servicio de cama extra para habilitar la consulta pública', path: ['serviceId'] }).optional(),
}).strict();

export const createCompanySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

// Configuracion del hotel que usa el flujo de reservas por WhatsApp: el
// porcentaje del anticipo y los contactos que se muestran al huesped.
export const updateCompanySettingsSchema = z
  .object({
    whatsapp: z.string().trim().max(30).optional().nullable(),
    phone: z.string().trim().max(30).optional().nullable(),
    bookingDepositPercent: z.number().int().min(0).max(100).optional(),
    bookingSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).optional().nullable(),
    configPage: publicPageConfigSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No hay campos para actualizar' });

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
