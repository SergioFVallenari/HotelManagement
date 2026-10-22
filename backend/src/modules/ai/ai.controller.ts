import type { Request, Response } from 'express';
import { conversationIdSchema, updateAiSettingsSchema } from './ai.schema.js';
import { generateDraft, getAiConfig, getAiSettings, updateAiSettings } from './ai.service.js';

export async function getAiConfigHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: getAiConfig() });
}

export async function getAiSettingsHandler(req: Request, res: Response): Promise<void> {
  res.json({ data: await getAiSettings(req.user!.companyId) });
}

export async function updateAiSettingsHandler(req: Request, res: Response): Promise<void> {
  const input = updateAiSettingsSchema.parse(req.body);
  res.json({
    data: await updateAiSettings(req.user!.companyId, {
      enabled: input.enabled,
      autoReply: input.autoReply,
      instructions: input.instructions ?? null,
    }),
  });
}

export async function draftHandler(req: Request, res: Response): Promise<void> {
  const { id } = conversationIdSchema.parse(req.params);
  res.json({ data: await generateDraft(id) });
}
