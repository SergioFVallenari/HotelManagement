import { z } from 'zod';

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
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No hay campos para actualizar' });

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
