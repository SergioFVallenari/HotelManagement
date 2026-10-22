import { z } from 'zod';

const channelEnum = z.enum(['INSTAGRAM', 'FACEBOOK', 'AIRBNB']);

export const conversationIdSchema = z.object({
  id: z.string().min(1),
});

export const listConversationsSchema = z.object({
  channel: channelEnum.optional(),
  q: z.string().trim().max(120).optional(),
  unread: z.enum(['true', 'false', '1', '0']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().max(100).optional(),
});

export const listMessagesSchema = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const sendMessageSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'El mensaje no puede estar vacío')
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 1000, 'El mensaje supera los 1000 caracteres permitidos'),
});
