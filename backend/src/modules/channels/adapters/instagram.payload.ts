import crypto from 'node:crypto';
import type { ChannelContentType } from '../../../generated/prisma/enums.js';
import type { ChannelAttachment, MessageEvent, NormalizedEvent } from '../channels.types.js';

export interface IgAttachment {
  type?: string;
  payload?: { url?: string };
}

export interface IgMessage {
  mid?: string;
  text?: string;
  is_echo?: boolean;
  is_unsupported?: boolean;
  attachments?: IgAttachment[];
  reply_to?: { mid?: string };
}

export interface IgMessaging {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: IgMessage;
  read?: { mid?: string };
}

export interface IgEntry {
  id?: string;
  messaging?: IgMessaging[];
}

export interface IgWebhookBody {
  object?: string;
  entry?: IgEntry[];
}

export function mapAttachmentType(type: string | undefined): ChannelContentType {
  switch (type) {
    case 'image':
      return 'IMAGE';
    case 'video':
    case 'reel':
    case 'ig_reel':
      return 'VIDEO';
    case 'audio':
      return 'AUDIO';
    case 'story_mention':
      return 'STORY';
    case 'share':
      return 'SHARE';
    default:
      return 'FILE';
  }
}

export function mapAttachments(attachments: IgAttachment[] | undefined): ChannelAttachment[] | null {
  if (!attachments || attachments.length === 0) return null;
  return attachments.map((a) => ({ type: mapAttachmentType(a.type), url: a.payload?.url }));
}

export function parseInstagramEvents(body: unknown): NormalizedEvent[] {
  const payload = (body ?? {}) as IgWebhookBody;
  if (payload.object !== 'instagram' || !Array.isArray(payload.entry)) return [];

  const events: NormalizedEvent[] = [];
  for (const entry of payload.entry) {
    const externalAccountId = entry.id;
    if (!externalAccountId || !Array.isArray(entry.messaging)) continue;

    for (const item of entry.messaging) {
      const at = new Date(item.timestamp ?? Date.now());
      const sender = item.sender?.id;
      const recipient = item.recipient?.id;

      if (item.read) {
        if (sender) {
          events.push({ kind: 'read', externalAccountId, externalThreadId: sender, participantId: sender, at });
        }
        continue;
      }

      const message = item.message;
      if (!message?.mid) continue;

      const isEcho = message.is_echo === true;
      const participantId = isEcho ? recipient : sender;
      if (!participantId) continue;

      const attachments = mapAttachments(message.attachments);
      const text = message.text ?? (message.is_unsupported ? '[Contenido no soportado]' : null);
      const contentType: ChannelContentType = text ? 'TEXT' : attachments ? attachments[0].type : 'SYSTEM';

      const event: MessageEvent = {
        kind: 'message',
        externalAccountId,
        externalThreadId: participantId,
        participantId,
        externalMessageId: message.mid,
        direction: isEcho ? 'OUT' : 'IN',
        contentType,
        text,
        attachments,
        replyToExternalId: message.reply_to?.mid ?? null,
        sentAt: at,
      };
      events.push(event);
    }
  }
  return events;
}

export function computeSignature(rawBody: Buffer | undefined, secret: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody ?? Buffer.alloc(0)).digest('hex');
}

export function signatureMatches(rawBody: Buffer | undefined, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  const [algo, signature] = signatureHeader.split('=');
  if (algo !== 'sha256' || !signature) return false;
  const expected = computeSignature(rawBody, secret);
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
