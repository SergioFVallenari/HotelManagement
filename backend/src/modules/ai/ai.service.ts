import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { addDays, todayHotel } from '../../lib/date.js';
import { decToNum } from '../../lib/money.js';
import { generateJson } from './ai.client.js';
import { AI_AVAILABILITY_DAYS, buildAvailability, describeDay } from './ai.availability.js';
import { buildSystemPrompt, buildUserTurns, type AiTurn } from './ai.prompt.js';
import { parseAiReply, type AiReply } from './ai.reply.js';
import { loadConversation, replyWindowEndsAt, sendMessage } from '../channels/channels.service.js';
import type { ChannelDirection } from '../../generated/prisma/enums.js';

const HISTORY_LIMIT = 20;

export interface AiSettingsData {
  enabled: boolean;
  autoReply: boolean;
  instructions: string | null;
}

export function getAiConfig() {
  return { configured: Boolean(env.ai.geminiApiKey) };
}

async function loadSettings(companyId: number): Promise<AiSettingsData> {
  const row = await prisma.companyAiSetting.findUnique({ where: { companyId } });
  return {
    enabled: row?.enabled ?? false,
    autoReply: row?.autoReply ?? true,
    instructions: row?.instructions ?? null,
  };
}

export async function getAiSettings(companyId: number): Promise<AiSettingsData> {
  return loadSettings(companyId);
}

export async function updateAiSettings(companyId: number, input: AiSettingsData): Promise<AiSettingsData> {
  const row = await prisma.companyAiSetting.upsert({
    where: { companyId },
    create: { companyId, ...input },
    update: { ...input },
  });
  return { enabled: row.enabled, autoReply: row.autoReply, instructions: row.instructions };
}

async function buildAiContext(conversationId: string) {
  const conversation = await loadConversation(conversationId);
  if (conversation.account.status !== 'ACTIVE') {
    throw new AppError(409, 'CHANNEL_NOT_CONNECTED', 'La cuenta del canal no está activa');
  }

  const today = todayHotel();

  const [settings, company, services, messages, room, reservations] = await Promise.all([
    loadSettings(conversation.companyId),
    prisma.company.findUnique({ where: { id: conversation.companyId }, select: { name: true } }),
    prisma.service.findMany({
      where: { companyId: conversation.companyId, isActive: true },
      select: { name: true, price: true, chargeType: true },
    }),
    prisma.channelMessage.findMany({
      where: { conversationId, sentAt: { gte: conversation.account.connectedAt } },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      take: HISTORY_LIMIT,
      select: { direction: true, text: true, sentAt: true },
    }),
    prisma.room.findMany({
      where: { companyId: conversation.companyId, isActive: true },
      orderBy: { number: 'asc' },
      select: {
        id: true,
        name: true,
        price: true,
        amenities: true,
        capacity: true,
        type: { select: { name: true } },
      },
    }),
    prisma.reservation.findMany({
      where: {
        status: { not: 'CANCELLED' },
        checkIn: { lt: addDays(today, AI_AVAILABILITY_DAYS) },
        checkOut: { gt: today },
      },
      select: { roomId: true, checkIn: true, checkOut: true, status: true },
    }),
  ]);

  const availability = buildAvailability(
    room.map((item) => ({ id: item.id, typeName: item.type.name, capacity: item.capacity })),
    reservations.map((reservation) => ({
      roomId: reservation.roomId,
      checkIn: reservation.checkIn,
      checkOut: reservation.checkOut,
      status: reservation.status,
    })),
    today,
  );

  const system = buildSystemPrompt({
    hotelName: company?.name ?? 'Hotel',
    today: describeDay(today),
    instructions: settings.instructions,
    services: services.map((service) => ({
      name: service.name,
      price: decToNum(service.price),
      chargeType: service.chargeType,
    })),
    rooms: room.map((item) => ({
      name: item.name,
      typeName: item.type.name,
      capacity: item.capacity,
      price: decToNum(item.price),
      amenities: item.amenities,
    })),
    availability,
  });

  const userTurns: AiTurn[] = buildUserTurns(
    messages.reverse().map((message) => ({
      direction: message.direction as ChannelDirection as 'IN' | 'OUT',
      text: message.text,
      sentAt: message.sentAt,
    })),
  );

  return { conversation, settings, system, userTurns };
}

export async function generateDraft(conversationId: string): Promise<AiReply & { canReply: boolean }> {
  const { conversation, settings, system, userTurns } = await buildAiContext(conversationId);
  if (!settings.enabled) {
    throw new AppError(409, 'AI_DISABLED', 'El asistente de IA está desactivado. Activalo en Ajustes.');
  }
  if (userTurns.length === 0) {
    throw new AppError(409, 'AI_NO_MESSAGES', 'La conversación no tiene mensajes para analizar');
  }

  const parsed = parseAiReply(await generateJson({ systemInstruction: system, userTurns }));
  const windowEnd = replyWindowEndsAt(conversation.channel, conversation.lastInboundAt);
  return { ...parsed, canReply: windowEnd !== null && windowEnd.getTime() > Date.now() };
}

// Se dispara desde el webhook de canales después de ingerir los eventos, en
// fire-and-forget: cualquier fallo (Gemini caído, cuota agotada, red) se traga
// con un warning y el webhook igual responde 200 a Meta.
export async function maybeAutoReply(conversationId: string): Promise<void> {
  try {
    const { conversation, settings, system, userTurns } = await buildAiContext(conversationId);
    if (!settings.enabled || !settings.autoReply) return;
    if (userTurns.length === 0) return;

    const windowEnd = replyWindowEndsAt(conversation.channel, conversation.lastInboundAt);
    if (!windowEnd || windowEnd.getTime() <= Date.now()) return;

    const lastMessage = await prisma.channelMessage.findFirst({
      where: { conversationId },
      orderBy: [{ sentAt: 'desc' }, { id: 'desc' }],
      select: { direction: true, text: true },
    });
    // Anti-loop: solo contesta si el último mensaje de la conversación es del
    // huésped (si un empleado ya respondió, o si llegó un adjunto sin texto,
    // no hacemos nada).
    if (!lastMessage || lastMessage.direction !== 'IN' || !lastMessage.text?.trim()) return;

    const parsed = parseAiReply(await generateJson({ systemInstruction: system, userTurns }));
    if (parsed.action !== 'auto') {
      console.log('[ai] respuesta sugerida (sin auto-reply)', { conversationId });
      return;
    }
    await sendMessage(conversationId, parsed.reply);
    console.log('[ai] auto-reply enviado', { conversationId });
  } catch (err) {
    console.warn('[ai] auto-reply falló', { conversationId }, err);
  }
}
