import type { Request, RequestHandler, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { unscoped } from '../../lib/tenant.js';
import { getAdapter } from './channels.registry.js';
import {
  ingestEvents,
  listConversations,
  listMessages,
  loadConversationHistory,
  markConversationRead,
  sendMessage,
} from './channels.service.js';
import { conversationIdSchema, listConversationsSchema, listMessagesSchema, sendMessageSchema } from './channels.schema.js';
import { maybeAutoReply } from '../ai/ai.service.js';
import type { NormalizedEvent } from './channels.types.js';
import type { ChannelType } from '../../generated/prisma/enums.js';

async function resolveAccount(channel: ChannelType, externalAccountId: string) {
  return unscoped(() =>
    prisma.channelAccount.findFirst({ where: { channel, externalAccountId } }),
  );
}

export function createWebhookHandler(channel: ChannelType): RequestHandler {
  return async (req: Request, res: Response): Promise<void> => {
    const adapter = getAdapter(channel);
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const signature = req.headers['x-hub-signature-256'];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;

    if (!adapter.verifySignature(rawBody, signatureHeader)) {
      console.warn('[channels] webhook con firma inválida', {
        channel,
        sig: signatureHeader,
        bodyLen: rawBody?.length ?? -1,
        bodyTail: rawBody ? rawBody.subarray(-200).toString('utf8') : null,
      });
      res.sendStatus(403);
      return;
    }

    try {
      const events = adapter.parseEvents(req.body);
      await ingestFromWebhook(channel, events);
    } catch (err) {
      console.error('[channels] error procesando webhook', { channel }, err);
    }

    res.sendStatus(200);
  };
}

async function ingestFromWebhook(channel: ChannelType, events: NormalizedEvent[]): Promise<void> {
  const byAccount = new Map<string, NormalizedEvent[]>();
  for (const event of events) {
    const list = byAccount.get(event.externalAccountId) ?? [];
    list.push(event);
    byAccount.set(event.externalAccountId, list);
  }

  for (const [externalAccountId, accountEvents] of byAccount) {
    const account = await resolveAccount(channel, externalAccountId);
    if (!account) {
      console.warn('[channels] webhook de una cuenta desconocida', { channel, externalAccountId });
      continue;
    }
    if (account.status === 'REVOKED') continue;
    const { inboundConversations } = await ingestEvents(account.companyId, account, accountEvents);
    // El asistente de IA corre en background: el 200 a Meta no espera a Gemini
    // y un fallo del proveedor jamás afecta la ingesta.
    for (const conversationId of inboundConversations) {
      void maybeAutoReply(conversationId);
    }
  }
}

export async function listConversationsHandler(req: Request, res: Response): Promise<void> {
  const query = listConversationsSchema.parse(req.query);
  res.json(await listConversations(query));
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  const { id } = conversationIdSchema.parse(req.params);
  const query = listMessagesSchema.parse(req.query);
  res.json(await listMessages(id, query));
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  const { id } = conversationIdSchema.parse(req.params);
  const { text } = sendMessageSchema.parse(req.body);
  res.status(201).json({ data: await sendMessage(id, text) });
}

export async function markReadHandler(req: Request, res: Response): Promise<void> {
  const { id } = conversationIdSchema.parse(req.params);
  await markConversationRead(id);
  res.status(204).end();
}

export async function historyHandler(req: Request, res: Response): Promise<void> {
  const { id } = conversationIdSchema.parse(req.params);
  res.json({ data: await loadConversationHistory(id) });
}
