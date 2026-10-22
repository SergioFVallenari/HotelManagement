import type { ChannelContentType } from '../../../generated/prisma/enums.js';
import type { ChannelAttachment, MessageEvent, ParticipantProfile } from '../channels.types.js';

export interface IgUser {
  id?: string;
  username?: string;
  name?: string;
  profile_pic?: string;
  profile_pic_url?: string;
}

export interface IgAttachmentData {
  url?: string;
  preview_url?: string;
  link?: string;
  name?: string;
  mime_type?: string;
}

export interface IgAttachment {
  id?: string;
  mime_type?: string;
  name?: string;
  image_data?: IgAttachmentData;
  video_data?: IgAttachmentData;
  audio_data?: IgAttachmentData;
  file_data?: IgAttachmentData;
  story_data?: IgAttachmentData;
  share?: IgAttachmentData;
}

export interface IgMessage {
  id?: string;
  created_time?: string | number;
  from?: IgUser;
  to?: { data?: IgUser[] } | IgUser[];
  message?: string;
  attachments?: { data?: IgAttachment[] } | IgAttachment[];
  reply_to?: { mid?: string; id?: string };
}

export interface IgConversation {
  id?: string;
  updated_time?: string | number;
  participants?: { data?: IgUser[] } | IgUser[];
  messages?: { data?: IgMessage[] } | IgMessage[];
}

export interface ConversationContext {
  externalAccountId: string;
  businessId: string;
  businessHandle?: string | null;
}

export interface ConversationRef {
  externalConversationId: string;
  participantId: string;
  participant: ParticipantProfile | null;
  latestMessage: MessageEvent | null;
}

export interface MessageContext extends ConversationContext {
  externalConversationId: string;
  threadId: string;
  participant?: ParticipantProfile | null;
}

export const IG_CONVERSATION_MESSAGE_FIELDS = 'id,created_time,from,to,message,attachments,reply_to';
export const IG_CONVERSATION_FIELDS = `id,updated_time,participants,messages.limit(1){${IG_CONVERSATION_MESSAGE_FIELDS}}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (isRecord(value) && Array.isArray(value.data)) return value.data as T[];
  return [];
}

export function toIgDate(value: unknown): Date | null {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) return toIgDate(Number(trimmed));
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function normalizeUser(value: unknown): IgUser | null {
  if (!isRecord(value)) return null;
  const user: IgUser = {};
  if (typeof value.id === 'string') user.id = value.id;
  if (typeof value.username === 'string') user.username = value.username;
  if (typeof value.name === 'string') user.name = value.name;
  if (typeof value.profile_pic === 'string') user.profile_pic = value.profile_pic;
  if (typeof value.profile_pic_url === 'string') user.profile_pic_url = value.profile_pic_url;
  return Object.keys(user).length ? user : null;
}

function participantsOf(value: unknown): IgUser[] {
  return asArray<unknown>(value)
    .map(normalizeUser)
    .filter((user): user is IgUser => user !== null);
}

export function isBusinessUser(
  user: IgUser | null | undefined,
  businessId: string,
  businessHandle?: string | null,
): boolean {
  if (!user) return false;
  if (user.id && user.id === businessId) return true;
  const handle = businessHandle?.trim().replace(/^@/, '').toLowerCase();
  if (!handle || !user.username) return false;
  return user.username.trim().replace(/^@/, '').toLowerCase() === handle;
}

function profileOf(user: IgUser | null | undefined): ParticipantProfile | null {
  if (!user) return null;
  const profile: ParticipantProfile = {};
  if (user.username) profile.handle = user.username;
  if (user.name) profile.name = user.name;
  const avatar = user.profile_pic ?? user.profile_pic_url;
  if (avatar) profile.avatarUrl = avatar;
  return Object.keys(profile).length ? profile : null;
}

function dataOf(value: unknown): IgAttachmentData | null {
  if (!isRecord(value)) return null;
  const data: IgAttachmentData = {};
  if (typeof value.url === 'string') data.url = value.url;
  if (typeof value.preview_url === 'string') data.preview_url = value.preview_url;
  if (typeof value.link === 'string') data.link = value.link;
  if (typeof value.name === 'string') data.name = value.name;
  if (typeof value.mime_type === 'string') data.mime_type = value.mime_type;
  return Object.keys(data).length ? data : null;
}

function attachment(
  type: ChannelContentType,
  data: IgAttachmentData | null,
  mimeType?: string,
  name?: string,
): ChannelAttachment {
  return {
    type,
    url: data?.url ?? data?.preview_url ?? data?.link,
    name: name ?? data?.name,
    mimeType: mimeType ?? data?.mime_type,
  };
}

export function mapConversationAttachment(raw: IgAttachment): ChannelAttachment | null {
  if (!isRecord(raw)) return null;
  const mimeType = typeof raw.mime_type === 'string' ? raw.mime_type : undefined;
  const name = typeof raw.name === 'string' ? raw.name : undefined;

  const image = dataOf(raw.image_data);
  if (image) return attachment('IMAGE', image, mimeType, name);
  const video = dataOf(raw.video_data);
  if (video) return attachment('VIDEO', video, mimeType, name);
  const audio = dataOf(raw.audio_data);
  if (audio) return attachment('AUDIO', audio, mimeType, name);
  const file = dataOf(raw.file_data);
  if (file) return attachment('FILE', file, mimeType, name);
  const story = dataOf(raw.story_data);
  if (story) return attachment('STORY', story, mimeType, name);
  const share = dataOf(raw.share);
  if (share) return attachment('SHARE', share, mimeType, name);

  if (mimeType?.startsWith('image/')) return attachment('IMAGE', null, mimeType, name);
  if (mimeType?.startsWith('video/')) return attachment('VIDEO', null, mimeType, name);
  if (mimeType?.startsWith('audio/')) return attachment('AUDIO', null, mimeType, name);
  return { type: 'FILE', name, mimeType };
}

export function mapConversationAttachments(value: unknown): ChannelAttachment[] {
  return asArray<IgAttachment>(value)
    .map(mapConversationAttachment)
    .filter((item): item is ChannelAttachment => item !== null);
}

function replyToId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.mid === 'string' && value.mid) return value.mid;
  if (typeof value.id === 'string' && value.id) return value.id;
  return null;
}

function counterpartOf(
  from: IgUser | null,
  to: IgUser[],
  businessId: string,
  businessHandle?: string | null,
): { user: IgUser | null; direction: 'IN' | 'OUT' } {
  const fromIsBusiness = isBusinessUser(from, businessId, businessHandle);
  if (fromIsBusiness) {
    return {
      user: to.find((user) => !isBusinessUser(user, businessId, businessHandle)) ?? null,
      direction: 'OUT',
    };
  }
  if (from) return { user: from, direction: 'IN' };
  return {
    user: to.find((user) => !isBusinessUser(user, businessId, businessHandle)) ?? null,
    direction: 'IN',
  };
}

export function parseInstagramMessage(raw: IgMessage, ctx: MessageContext): MessageEvent | null {
  const externalMessageId = typeof raw.id === 'string' && raw.id ? raw.id : null;
  const sentAt = toIgDate(raw.created_time);
  if (!externalMessageId || !sentAt) return null;

  const from = normalizeUser(raw.from);
  const to = participantsOf(raw.to);
  const { user: counterpart, direction } = counterpartOf(from, to, ctx.businessId, ctx.businessHandle);
  const participantId = counterpart?.id ?? ctx.threadId;
  const participant = profileOf(counterpart) ?? ctx.participant ?? null;
  const text = typeof raw.message === 'string' && raw.message.trim() ? raw.message : null;
  const attachments = mapConversationAttachments(raw.attachments);
  const contentType: ChannelContentType = text ? 'TEXT' : attachments[0]?.type ?? 'SYSTEM';

  return {
    kind: 'message',
    externalAccountId: ctx.externalAccountId,
    externalThreadId: ctx.threadId,
    participantId,
    externalConversationId: ctx.externalConversationId,
    externalMessageId,
    direction,
    contentType,
    text,
    attachments: attachments.length ? attachments : null,
    replyToExternalId: replyToId(raw.reply_to),
    sentAt,
    participant: participant ?? undefined,
  };
}

export function parseInstagramConversation(
  raw: IgConversation,
  ctx: ConversationContext,
): ConversationRef | null {
  const externalConversationId = typeof raw.id === 'string' && raw.id ? raw.id : null;
  if (!externalConversationId) return null;

  const participants = participantsOf(raw.participants);
  const messages = asArray<IgMessage>(raw.messages);
  const latest = messages[0] ?? null;
  const latestFrom = normalizeUser(latest?.from);
  const latestTo = participantsOf(latest?.to);
  const latestCounterpart = counterpartOf(latestFrom, latestTo, ctx.businessId, ctx.businessHandle).user;
  const counterpart =
    participants.find((user) => !isBusinessUser(user, ctx.businessId, ctx.businessHandle)) ??
    latestCounterpart;
  if (!counterpart?.id) return null;

  const participant = profileOf(counterpart) ?? profileOf(latestCounterpart) ?? null;
  const latestMessage = latest
    ? parseInstagramMessage(latest, {
        ...ctx,
        externalConversationId,
        threadId: counterpart.id,
        participant,
      })
    : null;

  return {
    externalConversationId,
    participantId: counterpart.id,
    participant,
    latestMessage,
  };
}

export function parseInstagramConversations(
  body: unknown,
  ctx: ConversationContext,
): ConversationRef[] {
  return asArray<IgConversation>(body)
    .map((raw) => parseInstagramConversation(raw, ctx))
    .filter((ref): ref is ConversationRef => ref !== null);
}

export function parseInstagramMessages(
  body: unknown,
  ctx: MessageContext,
): MessageEvent[] {
  return asArray<IgMessage>(body)
    .map((raw) => parseInstagramMessage(raw, ctx))
    .filter((event): event is MessageEvent => event !== null)
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
}

export function buildConversationsUrl(
  baseUrl: string,
  opts: { limit?: number; userId?: string | null } = {},
): string {
  const params = new URLSearchParams({
    platform: 'instagram',
    fields: IG_CONVERSATION_FIELDS,
    limit: String(opts.limit ?? 50),
  });
  if (opts.userId) params.set('user_id', opts.userId);
  return `${baseUrl.replace(/\/+$/, '')}/me/conversations?${params.toString()}`;
}

export function buildMessagesUrl(
  baseUrl: string,
  conversationId: string,
  limit = 20,
): string {
  const params = new URLSearchParams({
    fields: IG_CONVERSATION_MESSAGE_FIELDS,
    limit: String(limit),
  });
  return `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(conversationId)}/messages?${params.toString()}`;
}
