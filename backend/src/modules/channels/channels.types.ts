import type { ChannelAccount, ChannelConversation } from '../../generated/prisma/client.js';
import type { ChannelType, ChannelContentType } from '../../generated/prisma/enums.js';

export interface ChannelAttachment {
  type: ChannelContentType;
  url?: string;
  name?: string;
  mimeType?: string;
}

export interface MessageEvent {
  kind: 'message';
  externalAccountId: string;
  externalThreadId: string;
  participantId: string;
  externalConversationId?: string;
  participant?: ParticipantProfile;
  externalMessageId: string;
  direction: 'IN' | 'OUT';
  contentType: ChannelContentType;
  text: string | null;
  attachments: ChannelAttachment[] | null;
  replyToExternalId: string | null;
  sentAt: Date;
}

export interface ReadEvent {
  kind: 'read';
  externalAccountId: string;
  externalThreadId: string;
  participantId: string;
  at: Date;
}

export type NormalizedEvent = MessageEvent | ReadEvent;

export interface ParticipantProfile {
  handle?: string;
  name?: string;
  avatarUrl?: string;
}

export interface SendResult {
  externalMessageId: string;
}

export interface RefreshResult {
  accessToken: string;
  expiresIn?: number;
}

export interface ChannelAdapter {
  channel: ChannelType;
  verifySignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): boolean;
  parseEvents(body: unknown): NormalizedEvent[];
  sendText(account: ChannelAccount, threadId: string, text: string): Promise<SendResult>;
  fetchProfile?(account: ChannelAccount, participantId: string): Promise<ParticipantProfile | null>;
  fetchRecentEvents?(account: ChannelAccount): Promise<NormalizedEvent[]>;
  fetchHistory?(account: ChannelAccount, conversation: ChannelConversation): Promise<NormalizedEvent[]>;
  refreshToken?(account: ChannelAccount): Promise<RefreshResult>;
  replyWindowEndsAt?(lastInboundAt: Date | null): Date | null;
}

export const DEFAULT_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function defaultReplyWindowEndsAt(lastInboundAt: Date | null): Date | null {
  if (!lastInboundAt) return null;
  return new Date(lastInboundAt.getTime() + DEFAULT_REPLY_WINDOW_MS);
}
