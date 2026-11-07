import { z } from 'zod';

const recipientFields = z.object({
  email: z.string().trim().toLowerCase().max(254, 'El email es demasiado largo').email('Ingresá un email válido'),
  name: z.string().trim().min(1, 'Ingresá el nombre del destinatario').max(255, 'El nombre es demasiado largo'),
  enabled: z.boolean(),
}).strict();

export const createRecipientSchema = recipientFields.extend({ enabled: z.boolean().default(true) });

export const updateRecipientSchema = recipientFields.partial().refine(
  (input) => Object.keys(input).length > 0,
  'Indicá al menos un campo para actualizar',
);

export const recipientIdSchema = z.object({
  id: z.string().regex(/^[1-9]\d*$/, 'El identificador debe ser un entero positivo')
    .transform(Number).pipe(z.number().int().max(2_147_483_647, 'El identificador está fuera de rango')),
});

export const recipientSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  email: z.email(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type CreateRecipientInput = z.infer<typeof createRecipientSchema>;
export type UpdateRecipientInput = z.infer<typeof updateRecipientSchema>;
