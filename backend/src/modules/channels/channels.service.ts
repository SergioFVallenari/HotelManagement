import { prisma } from '../../config/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { ChannelAccount, ChannelConversation } from '../../generated/prisma/client.js';
import { AppError } from '../../lib/AppError.js';
import { conflict, notFound } from '../../lib/AppError.js';
import { withTenant } from '../../lib/tenant.js';
import { paginationMeta, parsePagination } from '../../lib/pagination.js';
import { encryptSecret, splitEncrypted } from '../../lib/secretBox.js';
import { getAdapter } from './channels.registry.js';
import type { MessageEvent, NormalizedEvent, ParticipantProfile } from './channels.types.js';
import { defaultReplyWindowEndsAt } from './channels.types.js';
import type { ChannelType } from '../../generated/prisma/enums.js';

const PREVIEW_LIMIT = 160;
const REFRESH_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

interface IngestOptions {
  unread?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const ATTACHMENT_LABELS: Record<string, string> = {
  IMAGE: '[Imagen]',
  VIDEO: '[Video]',
  AUDIO: '[Audio]',
  FILE: '[Archivo]',
  STORY: '[Historia]',
  SHARE: '[Publicación]',
};

function previewText(event: MessageEvent): string {
  if (event.text) return event.text.slice(0, PREVIEW_LIMIT);
  if (event.attachments?.length) {
    return ATTACHMENT_LABELS[event.attachments[0].type] ?? '[Adjunto]';
  }
  return '[...]';
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function replyWindowEndsAt(channel: ChannelType, lastInboundAt: Date | null): Date | null {
  const adapter = getAdapter(channel);
  return adapter.replyWindowEndsAt ? adapter.replyWindowEndsAt(lastInboundAt) : defaultReplyWindowEndsAt(lastInboundAt);
}

export function serializeConversation(conversation: ChannelConversation) {
  const windowEnd = replyWindowEndsAt(conversation.channel, conversation.lastInboundAt);
  return {
    id: conversation.id,
    channel: conversation.channel,
    externalThreadId: conversation.externalThreadId,
    participantId: conversation.participantId,
    participantHandle: conversation.participantHandle,
    participantName: conversation.participantName,
    participantAvatar: conversation.participantAvatar,
    lastMessageAt: conversation.lastMessageAt,
    lastMessagePreview: conversation.lastMessagePreview,
    lastInboundAt: conversation.lastInboundAt,
    unreadCount: conversation.unreadCount,
    replyWindowEndsAt: windowEnd,
    canReply: windowEnd !== null && windowEnd.getTime() > Date.now(),
  };
}

function buildConversationCreate(companyId: number, account: ChannelAccount, event: MessageEvent, profile: ParticipantProfile | null) {
  return {
    companyId,
    channel: account.channel,
    accountId: account.id,
    externalThreadId: event.externalThreadId,
    participantId: event.participantId,
    participantHandle: profile?.handle ?? null,
    participantName: profile?.name ?? null,
    participantAvatar: profile?.avatarUrl ?? null,
    metadata: event.externalConversationId
      ? { externalConversationId: event.externalConversationId }
      : undefined,
  };
}

async function ingestMessage(
  companyId: number,
  account: ChannelAccount,
  event: MessageEvent,
  options: IngestOptions = {},
): Promise<{ created: boolean; conversationId: string }> {
  const adapter = getAdapter(account.channel);

  let profile: ParticipantProfile | null = event.participant ?? null;
  if (adapter.fetchProfile && !profile?.handle && !profile?.name) {
    const existing = await withTenant(companyId, () =>
      prisma.channelConversation.findUnique({
        where: { accountId_externalThreadId: { accountId: account.id, externalThreadId: event.externalThreadId } },
        select: { participantHandle: true, participantName: true },
      }),
    );
    if (!existing || (!existing.participantHandle && !existing.participantName)) {
      profile = await adapter.fetchProfile(account, event.participantId);
    }
  }

  const { created, conversationId } = await withTenant(companyId, () =>
    prisma.$transaction(async (tx) => {
      const conversation = await tx.channelConversation.upsert({
        where: { accountId_externalThreadId: { accountId: account.id, externalThreadId: event.externalThreadId } },
        create: buildConversationCreate(companyId, account, event, profile),
        update: {
          ...(profile
            ? {
                participantHandle: profile.handle ?? undefined,
                participantName: profile.name ?? undefined,
                participantAvatar: profile.avatarUrl ?? undefined,
              }
            : {}),
          ...(event.externalConversationId
            ? { metadata: { externalConversationId: event.externalConversationId } }
            : {}),
        },
        select: { id: true, lastMessageAt: true, lastInboundAt: true },
      });

      let created = true;
      try {
        await tx.channelMessage.create({
          data: {
            companyId,
            conversationId: conversation.id,
            externalMessageId: event.externalMessageId,
            direction: event.direction,
            contentType: event.contentType,
            text: event.text,
            attachments: event.attachments
              ? (event.attachments as unknown as Prisma.InputJsonValue)
              : undefined,
            replyToExternalId: event.replyToExternalId,
            status: event.direction === 'IN' ? 'RECEIVED' : 'SENT',
            sentAt: event.sentAt,
          },
        });
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        created = false;
      }

      if (created) {
        const newestMessage =
          !conversation.lastMessageAt || event.sentAt.getTime() >= conversation.lastMessageAt.getTime();
        const newestInbound =
          event.direction === 'IN' &&
          (!conversation.lastInboundAt || event.sentAt.getTime() >= conversation.lastInboundAt.getTime());
        const data: Prisma.ChannelConversationUpdateInput = {};

        if (newestMessage) {
          data.lastMessageAt = event.sentAt;
          data.lastMessagePreview = previewText(event);
        }
        if (newestInbound) {
          data.lastInboundAt = event.sentAt;
          if (options.unread !== false) {
            data.unreadCount = { increment: 1 };
          }
        }
        if (Object.keys(data).length > 0) {
          await tx.channelConversation.update({ where: { id: conversation.id }, data });
        }
      }

      return { created, conversationId: conversation.id };
    }),
  );

  return { created, conversationId };
}

async function ingestRead(
  companyId: number,
  account: ChannelAccount,
  threadId: string,
): Promise<void> {
  await withTenant(companyId, async () => {
    const conversation = await prisma.channelConversation.findFirst({
      where: { accountId: account.id, externalThreadId: threadId },
      select: { id: true },
    });
    if (!conversation) return;
    await prisma.channelConversation.update({ where: { id: conversation.id }, data: { unreadCount: 0 } });
  });
}

export interface IngestResult {
  stored: number;
  inboundConversations: Set<string>;
}

export async function ingestEvents(
  companyId: number,
  account: ChannelAccount,
  events: NormalizedEvent[],
  options: IngestOptions = {},
): Promise<IngestResult> {
  let stored = 0;
  const inboundConversations = new Set<string>();
  for (const event of events) {
    if (event.kind === 'read') {
      await ingestRead(companyId, account, event.externalThreadId);
      continue;
    }
    if (event.sentAt < account.connectedAt) continue;
    const result = await ingestMessage(companyId, account, event, options);
    if (!result.created) continue;
    stored += 1;
    if (event.direction === 'IN') inboundConversations.add(result.conversationId);
  }
  return { stored, inboundConversations };
}

export async function listConversations(query: Record<string, unknown>) {
  const pagination = parsePagination(query);
  const channel = typeof query.channel === 'string' && query.channel ? (query.channel as ChannelType) : undefined;
  const unreadOnly = query.unread === 'true' || query.unread === '1';
  const search = typeof query.q === 'string' ? query.q.trim() : '';

  const where = {
    ...(channel ? { channel } : {}),
    ...(unreadOnly ? { unreadCount: { gt: 0 } } : {}),
    ...(search
      ? {
          OR: [
            { participantHandle: { contains: search, mode: 'insensitive' as const } },
            { participantName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.channelConversation.findMany({
      where,
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      skip: pagination.skip,
      take: pagination.take,
    }),
    prisma.channelConversation.count({ where }),
  ]);

  return { data: rows.map(serializeConversation), meta: paginationMeta(total, pagination) };
}

export async function loadConversation(id: string) {
  const conversation = await prisma.channelConversation.findFirst({
    where: { id },
    include: { account: true },
  });
  if (!conversation) throw notFound('Conversación', id);
  return conversation;
}

export interface SyncResult {
  imported: number;
  conversations: number;
  syncedAt: string;
}

export async function syncChannelAccount(channel: ChannelType): Promise<SyncResult> {
  const account = await prisma.channelAccount.findFirst({ where: { channel } });
  if (!account) {
    throw new AppError(404, 'IG_NOT_CONNECTED', 'No hay una cuenta de Instagram conectada');
  }
  if (account.status !== 'ACTIVE') {
    throw new AppError(409, 'CHANNEL_NOT_CONNECTED', 'La cuenta del canal no está activa');
  }

  const adapter = getAdapter(channel);
  if (!adapter.fetchRecentEvents) {
    throw new AppError(501, 'CHANNEL_SYNC_UNSUPPORTED', 'El canal no permite sincronizar conversaciones');
  }

  const fresh = await refreshAccountIfNeeded(account);
  const events = await adapter.fetchRecentEvents(fresh);
  const { stored } = await ingestEvents(fresh.companyId, fresh, events, {
    unread: true,
  });

  const syncedAt = new Date().toISOString();
  const metadata = isRecord(fresh.metadata) ? fresh.metadata : {};
  await prisma.channelAccount.update({
    where: { id: fresh.id },
    data: {
      metadata: { ...metadata, lastSyncAt: syncedAt } as Prisma.InputJsonObject,
    },
  });

  return { imported: stored, conversations: events.length, syncedAt };
}

export interface HistoryResult {
  imported: number;
}

export async function loadConversationHistory(conversationId: string): Promise<HistoryResult> {
  const conversation = await loadConversation(conversationId);
  const account = conversation.account;

  if (account.status !== 'ACTIVE') {
    throw new AppError(409, 'CHANNEL_NOT_CONNECTED', 'La cuenta del canal no está activa');
  }

  const adapter = getAdapter(conversation.channel);
  if (!adapter.fetchHistory) {
    throw new AppError(501, 'CHANNEL_HISTORY_UNSUPPORTED', 'El canal no permite importar historial');
  }

  const fresh = await refreshAccountIfNeeded(account);
  const events = await adapter.fetchHistory(fresh, conversation);
  const { stored } = await ingestEvents(fresh.companyId, fresh, events, {
    unread: false,
  });

  return { imported: stored };
}

export async function listMessages(conversationId: string, query: Record<string, unknown>) {
  const conversation = await loadConversation(conversationId);

  const limit = Math.min(100, Math.max(1, Number.parseInt(String(query.limit ?? '50'), 10) || 50));
  const before = typeof query.before === 'string' && query.before ? query.before : undefined;

  const rows = await prisma.channelMessage.findMany({
    where: { conversationId, sentAt: { gte: conversation.account.connectedAt } },
    orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(before ? { cursor: { id: before }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const data = rows.slice(0, limit).reverse();
  return { data, meta: { hasMore } };
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await loadConversation(conversationId);
  await prisma.channelConversation.updateMany({ where: { id: conversationId }, data: { unreadCount: 0 } });
}

export async function refreshAccountIfNeeded(account: ChannelAccount): Promise<ChannelAccount> {
  if (!account.tokenExpiresAt) return account;
  if (account.tokenExpiresAt.getTime() - Date.now() > REFRESH_THRESHOLD_MS) return account;

  const adapter = getAdapter(account.channel);
  if (!adapter.refreshToken) return account;

  try {
    const refreshed = await adapter.refreshToken(account);
    const enc = encryptSecret(refreshed.accessToken);
    const { iv } = splitEncrypted(enc);
    return await prisma.channelAccount.update({
      where: { id: account.id },
      data: {
        accessTokenEnc: enc,
        accessTokenIv: iv,
        tokenExpiresAt: refreshed.expiresIn ? new Date(Date.now() + refreshed.expiresIn * 1000) : null,
        lastRefreshedAt: new Date(),
        status: 'ACTIVE',
      },
    });
  } catch (err) {
    console.error('[channels] no se pudo refrescar el token', { accountId: account.id, channel: account.channel }, err);
    await prisma.channelAccount.update({ where: { id: account.id }, data: { status: 'EXPIRED' } });
    throw new AppError(409, 'CHANNEL_TOKEN_EXPIRED', 'La conexión del canal expiró. Volvé a conectarla.');
  }
}

export async function sendMessage(conversationId: string, text: string) {
  const conversation = await loadConversation(conversationId);
  const account = conversation.account;

  if (account.status !== 'ACTIVE') {
    throw new AppError(409, 'CHANNEL_NOT_CONNECTED', 'La cuenta del canal no está activa');
  }

  const windowEnd = replyWindowEndsAt(conversation.channel, conversation.lastInboundAt);
  if (windowEnd === null || windowEnd.getTime() <= Date.now()) {
    throw new AppError(409, 'CHANNEL_WINDOW_EXPIRED', 'La ventana de 24 horas expiró. El huésped debe escribir primero.');
  }

  const freshAccount = await refreshAccountIfNeeded(account);
  const adapter = getAdapter(conversation.channel);
  const result = await adapter.sendText(freshAccount, conversation.externalThreadId, text);
  const sentAt = new Date();

  try {
    await prisma.channelMessage.create({
      data: {
        companyId: conversation.companyId,
        conversationId: conversation.id,
        externalMessageId: result.externalMessageId,
        direction: 'OUT',
        contentType: 'TEXT',
        text,
        status: 'SENT',
        sentAt,
      },
    });
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
  }

  await prisma.channelConversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: sentAt, lastMessagePreview: text.slice(0, PREVIEW_LIMIT) },
  });

  return {
    id: result.externalMessageId,
    direction: 'OUT' as const,
    contentType: 'TEXT' as const,
    text,
    status: 'SENT' as const,
    sentAt,
    attachments: null,
  };
}

export { replyWindowEndsAt };
