import { env } from '../../../config/env.js';
import { AppError } from '../../../lib/AppError.js';
import { decryptSecret } from '../../../lib/secretBox.js';
import { ChannelType } from '../../../generated/prisma/enums.js';
import type {
  ChannelAdapter,
  NormalizedEvent,
  ParticipantProfile,
  RefreshResult,
  SendResult,
} from '../channels.types.js';
import { defaultReplyWindowEndsAt } from '../channels.types.js';
import { parseInstagramEvents, signatureMatches } from './instagram.payload.js';
import {
  buildConversationsUrl,
  buildMessagesUrl,
  parseInstagramConversations,
  parseInstagramMessages,
} from './instagram.conversations.js';

function accessToken(account: { accessTokenEnc: string | null }): string {
  if (!account.accessTokenEnc) {
    throw new AppError(409, 'CHANNEL_NOT_CONNECTED', 'La cuenta del canal no tiene un token válido');
  }
  return decryptSecret(account.accessTokenEnc);
}

function isWindowError(status: number, body: any): boolean {
  if (status !== 400) return false;
  const code = body?.error?.code;
  const subcode = body?.error?.error_subcode;
  return code === 10 || subcode === 2534022;
}

const FALLBACK_LIMIT = 20;
const FALLBACK_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function businessContext(account: { externalAccountId: string; handle: string | null }) {
  return {
    externalAccountId: account.externalAccountId,
    businessId: account.externalAccountId,
    businessHandle: account.handle,
  };
}

function externalConversationId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>).externalConversationId;
  return typeof value === 'string' && value ? value : null;
}

async function graphGet(url: string, token: string, code: string): Promise<unknown> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const detail = json?.error?.message ?? `HTTP ${res.status}`;
    throw new AppError(502, code, `Instagram rechazó la consulta: ${detail}`);
  }
  return json;
}

export const instagramAdapter: ChannelAdapter = {
  channel: ChannelType.INSTAGRAM,

  verifySignature(rawBody, signatureHeader): boolean {
    return signatureMatches(rawBody, signatureHeader, env.ig.appSecret);
  },

  parseEvents(body) {
    return parseInstagramEvents(body);
  },

  async sendText(account, threadId, text): Promise<SendResult> {
    const res = await fetch(`${env.ig.graphApiUrl}/${account.externalAccountId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken(account)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ recipient: { id: threadId }, message: { text } }),
    });

    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.message_id) {
      const detail = json?.error?.message ?? `HTTP ${res.status}`;
      if (isWindowError(res.status, json)) {
        throw new AppError(409, 'CHANNEL_WINDOW_EXPIRED', 'La ventana de 24 horas expiró. El huésped debe escribir primero.');
      }
      throw new AppError(502, 'CHANNEL_SEND_FAILED', `Instagram rechazó el mensaje: ${detail}`);
    }
    return { externalMessageId: String(json.message_id) };
  },

  async fetchRecentEvents(account): Promise<NormalizedEvent[]> {
    const base = env.ig.graphApiUrl;
    const token = accessToken(account);
    const context = businessContext(account);
    const list = await graphGet(
      buildConversationsUrl(base, { limit: 50 }),
      token,
      'CHANNEL_SYNC_FAILED',
    );
    const refs = parseInstagramConversations(list, context);
    const events: NormalizedEvent[] = [];
    let fallbacks = 0;

    for (const ref of refs) {
      if (ref.latestMessage) {
        events.push(ref.latestMessage);
        continue;
      }
      if (fallbacks >= FALLBACK_LIMIT) break;
      if (fallbacks > 0) await delay(FALLBACK_DELAY_MS);
      fallbacks += 1;

      try {
        const page = await graphGet(
          buildMessagesUrl(base, ref.externalConversationId, 1),
          token,
          'CHANNEL_SYNC_FAILED',
        );
        const messages = parseInstagramMessages(page, {
          ...context,
          externalConversationId: ref.externalConversationId,
          threadId: ref.participantId,
          participant: ref.participant,
        });
        const latest = messages[messages.length - 1];
        if (latest) events.push(latest);
      } catch (err) {
        console.warn('[channels] no se pudo leer el último mensaje de Instagram', {
          conversationId: ref.externalConversationId,
        }, err);
      }
    }

    return events;
  },

  async fetchHistory(account, conversation): Promise<NormalizedEvent[]> {
    const base = env.ig.graphApiUrl;
    const token = accessToken(account);
    const context = businessContext(account);
    let conversationId = externalConversationId(conversation.metadata);
    let participant: ParticipantProfile = {
      handle: conversation.participantHandle ?? undefined,
      name: conversation.participantName ?? undefined,
      avatarUrl: conversation.participantAvatar ?? undefined,
    };

    if (!conversationId) {
      const list = await graphGet(
        buildConversationsUrl(base, { userId: conversation.externalThreadId, limit: 1 }),
        token,
        'CHANNEL_HISTORY_FAILED',
      );
      const ref = parseInstagramConversations(list, context)[0];
      if (!ref) {
        throw new AppError(502, 'CHANNEL_HISTORY_FAILED', 'No se encontró la conversación en Instagram');
      }
      conversationId = ref.externalConversationId;
      participant = ref.participant ?? participant;
    }

    const page = await graphGet(
      buildMessagesUrl(base, conversationId, 20),
      token,
      'CHANNEL_HISTORY_FAILED',
    );
    return parseInstagramMessages(page, {
      ...context,
      externalConversationId: conversationId,
      threadId: conversation.externalThreadId,
      participant,
    });
  },

  async fetchProfile(account, participantId): Promise<ParticipantProfile | null> {
    try {
      const res = await fetch(
        `${env.ig.graphApiUrl}/${participantId}?fields=name,username,profile_pic`,
        { headers: { Authorization: `Bearer ${accessToken(account)}` } },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as any;
      return {
        handle: json?.username ? String(json.username) : undefined,
        name: json?.name ? String(json.name) : undefined,
        avatarUrl: json?.profile_pic ? String(json.profile_pic) : undefined,
      };
    } catch {
      return null;
    }
  },

  async refreshToken(account): Promise<RefreshResult> {
    const token = accessToken(account);
    const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token });
    const res = await fetch(`${env.ig.graphHost}/refresh_access_token?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new AppError(502, 'CHANNEL_TOKEN_REFRESH', 'No se pudo refrescar el token de Instagram', {
        detail: text.slice(0, 200),
      });
    }
    const json = (await res.json()) as any;
    if (!json?.access_token) {
      throw new AppError(502, 'CHANNEL_TOKEN_REFRESH', 'Respuesta inválida al refrescar el token de Instagram');
    }
    return { accessToken: String(json.access_token), expiresIn: Number(json.expires_in) || undefined };
  },

  replyWindowEndsAt: defaultReplyWindowEndsAt,
};
