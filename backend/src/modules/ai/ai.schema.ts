import { z } from 'zod';

export const conversationIdSchema = z.object({
  id: z.string().min(1),
});

export const updateAiSettingsSchema = z.object({
  enabled: z.boolean(),
  autoReply: z.boolean(),
  instructions: z
    .string()
    .trim()
    .max(2000, 'Las instrucciones no pueden superar los 2000 caracteres')
    .nullable()
    .optional(),
});
