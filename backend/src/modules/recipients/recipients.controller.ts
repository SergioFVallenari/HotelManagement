import type { Request, Response } from 'express';
import { createRecipientSchema, recipientIdSchema, updateRecipientSchema } from './recipients.schema.js';
import { createRecipient, getRecipients, removeRecipient, saveRecipient } from './recipients.service.js';

export async function listRecipients(req: Request, res: Response): Promise<void> {
  res.json({ data: await getRecipients(req.user!.companyId) });
}

export async function createRecipients(req: Request, res: Response): Promise<void> {
  const input = createRecipientSchema.parse(req.body);
  res.status(201).json({ data: await createRecipient(req.user!.companyId, input) });
}

export async function updateRecipient(req: Request, res: Response): Promise<void> {
  const { id } = recipientIdSchema.parse(req.params);
  const input = updateRecipientSchema.parse(req.body);
  res.json({ data: await saveRecipient(req.user!.companyId, id, input) });
}

export async function deleteRecipient(req: Request, res: Response): Promise<void> {
  const { id } = recipientIdSchema.parse(req.params);
  await removeRecipient(req.user!.companyId, id);
  res.status(204).end();
}
