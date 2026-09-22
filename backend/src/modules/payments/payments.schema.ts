import { z } from 'zod';

export const recordPaymentSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['CASH', 'CARD', 'TRANSFER']),
  reference: z.string().max(100).optional().nullable(),
});

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;