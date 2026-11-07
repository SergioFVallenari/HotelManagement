import { randomBytes } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { todayHotel, nightsBetween } from '../../lib/date.js';
import { decToNum, round2 } from '../../lib/money.js';
import { roomStayTotal } from '../../lib/pricing.js';
import { generateJson } from './ai.client.js';
import { reservationSystemPrompt } from './aiReservation.prompt.js';
import { aiGuestEmailSchema, reservationIntentSchema, reservationIntentResponseSchema, type ReservationIntent } from './aiReservation.schema.js';
import { normalizeAiText as normalize, selectAiRooms } from './aiReservation.selection.js';
import { signReservationProposal, verifyReservationProposal } from './aiReservation.token.js';
import { resolveAiGuest } from './aiReservation.guest.js';
import { guestPhoneSchema } from '../guests/guests.schema.js';
import { createReservationSchema } from '../reservations/reservations.schema.js';
import { createReservation, FULL_INCLUDE, loadServices, serializeReservation } from '../reservations/reservations.service.js';
import type { AiTurn } from './ai.prompt.js';

const ask = (reply: string) => ({ reply, proposal: null });

async function requireReservationAssistant(companyId: number) {
  const settings = await prisma.companyAiSetting.findUnique({ where: { companyId }, select: { reservationAssistantEnabled: true } });
  if (!settings?.reservationAssistantEnabled) {
    throw new AppError(409, 'ASISTENTE_RESERVAS_DESHABILITADO', 'El asistente de reservas está deshabilitado. Activalo en Ajustes → Asistente de IA.');
  }
}

export async function prepareAiReservation(messages: AiTurn[], companyId: number, userId: number) {
  await requireReservationAssistant(companyId);
  const [rooms, services] = await Promise.all([
    prisma.room.findMany({ where: { companyId, isActive: true }, include: { type: true }, orderBy: { number: 'asc' } }),
    prisma.service.findMany({ where: { companyId, isActive: true } }),
  ]);
  const raw = await generateJson({
    systemInstruction: reservationSystemPrompt(todayHotel().toISOString().slice(0, 10), {
      rooms: rooms.map((r) => ({ number: r.number, type: r.type.name, capacity: r.capacity, maxExtraBeds: r.maxExtraBeds })),
      services: services.map((s) => ({ name: s.name, chargeType: s.chargeType })),
    }),
    userTurns: messages,
    responseSchema: reservationIntentResponseSchema,
  });
  let intent: ReservationIntent;
  try {
    intent = reservationIntentSchema.parse(JSON.parse(raw));
  } catch {
    throw new AppError(502, 'RESPUESTA_IA_INVALIDA', 'No pude interpretar el pedido. Probá indicando las fechas y las personas.');
  }
  if (intent.question) return ask(intent.question);
  if (!intent.checkIn || !intent.checkOut) return ask('¿De qué mes y año son las fechas de entrada y salida?');
  const checkIn = new Date(`${intent.checkIn}T00:00:00Z`);
  const checkOut = new Date(`${intent.checkOut}T00:00:00Z`);
  if (checkIn < todayHotel() || checkOut <= checkIn) return ask('Indicá fechas válidas: entrada desde hoy y salida posterior a la entrada.');
  if (!intent.rooms.length) return ask('¿Cuántas personas son y cómo querés distribuirlas por habitación?');
  if (!intent.firstName || !intent.lastName) return ask('¿Cuál es el nombre y apellido del titular?');

  const guests = await prisma.guest.findMany({
    where: { companyId, firstName: { equals: intent.firstName, mode: 'insensitive' }, lastName: { equals: intent.lastName, mode: 'insensitive' } },
    take: 100,
  });
  const resolution = resolveAiGuest(guests, intent);
  if (resolution.question) return ask(resolution.question);
  const guest = resolution.guest;
  if (intent.email && !aiGuestEmailSchema.safeParse(intent.email).success) return ask('El email indicado no es válido. Corregilo o indicá que lo dejemos sin email.');
  if (!guestPhoneSchema.safeParse(intent.phone).success) return ask('El teléfono indicado no es válido. Corregilo o indicá que lo dejemos sin teléfono.');
  if (!guest && intent.email && await prisma.guest.findUnique({ where: { companyId_email: { companyId, email: intent.email } } })) {
    return ask('Ese email pertenece a otro huésped. Verificá el nombre y el email antes de continuar.');
  }

  const occupied = await prisma.reservation.findMany({
    where: { companyId, status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } },
    select: { roomId: true, rooms: { select: { roomId: true } } },
  });
  const taken = new Set(occupied.flatMap((r) => [r.roomId, ...r.rooms.map((line) => line.roomId)]));
  const nights = nightsBetween(checkIn, checkOut);
  const selections: { roomId: number; persons: number; extraBeds: number }[] = [];
  const summaryRooms: { number: string; type: string; persons: number; extraBeds: number; total: number }[] = [];
  const selectedRooms = selectAiRooms(intent.rooms, rooms.filter((room) => !taken.has(room.id)).map((room) => ({ ...room, typeName: room.type.name, price: decToNum(room.price) })), nights);
  if (!selectedRooms) return ask('No hay disponibilidad para esa distribución y preferencias durante toda la estadía. ¿Querés cambiar las fechas o la distribución? No creé ninguna reserva.');
  for (const [index, requested] of intent.rooms.entries()) {
    const room = selectedRooms[index]!;
    selections.push({ roomId: room.id, persons: requested.persons - requested.extraBeds, extraBeds: requested.extraBeds });
    summaryRooms.push({ number: room.number, type: room.typeName, persons: requested.persons, extraBeds: requested.extraBeds, total: roomStayTotal(room.pricingMode, room.price, nights, requested.persons - requested.extraBeds) });
  }
  const selectedServices: { serviceId: number; quantity: number }[] = [];
  for (const requested of intent.services) {
    const matching = services.filter((s) => normalize(s.name) === normalize(requested.name));
    if (matching.length !== 1) return ask(`No pude identificar el servicio «${requested.name}». ¿Cuál del catálogo querés agregar?`);
    if (!selectedServices.some((s) => s.serviceId === matching[0]!.id)) selectedServices.push({ serviceId: matching[0]!.id, quantity: requested.quantity });
  }
  const persons = selections.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = selections.reduce((sum, line) => sum + line.extraBeds, 0);
  if (extraBeds > 0) {
    const extraBed = services.find((s) => s.isExtraBed);
    if (!extraBed) return ask('No hay un servicio de cama extra configurado. Elegí una distribución sin camas extras.');
    if (!selectedServices.some((s) => s.serviceId === extraBed.id)) selectedServices.push({ serviceId: extraBed.id, quantity: 1 });
  }
  if (extraBeds === 0 && selectedServices.some((line) => services.find((s) => s.id === line.serviceId)?.isExtraBed)) return ask('Indicá en qué habitación y cuántas camas extras necesitás.');
  const input = createReservationSchema.parse({
    rooms: selections, persons, extraBeds, checkIn: intent.checkIn, checkOut: intent.checkOut,
    ...(guest ? { guestId: guest.id } : { guest: { firstName: intent.firstName, lastName: intent.lastName, phone: intent.phone, email: intent.email } }),
    services: selectedServices, notes: intent.notes,
  });
  const lines = await loadServices(input.services, { persons, extraBeds, nights, roomCount: selections.length });
  const serviceSummary = lines.map((line) => ({ name: line.name, quantity: line.quantity, total: round2(line.quantity * decToNum(line.price)) }));
  const total = round2(summaryRooms.reduce((sum, room) => sum + room.total, 0) + serviceSummary.reduce((sum, service) => sum + service.total, 0));
  const code = `RSV-IA-${randomBytes(16).toString('hex').toUpperCase()}`;
  const token = signReservationProposal({ companyId, userId, input, total, code }, env.jwtSecret);
  return {
    reply: 'Revisá la propuesta. Todavía no creé la reserva ni registré pagos. Podés corregir el pedido o confirmar con el botón.',
    proposal: { token, checkIn: input.checkIn, checkOut: input.checkOut, guest: `${intent.firstName} ${intent.lastName}`, email: guest?.email ?? intent.email, phone: guest?.phone ?? intent.phone, existingGuest: Boolean(guest), rooms: summaryRooms, services: serviceSummary, notes: input.notes, total },
  };
}

export async function confirmAiReservation(token: string, companyId: number, userId: number) {
  await requireReservationAssistant(companyId);
  let payload;
  try {
    payload = verifyReservationProposal(token, env.jwtSecret);
  } catch {
    throw new AppError(409, 'PROPUESTA_VENCIDA', 'La propuesta venció o es inválida. Pedí una nueva propuesta.');
  }
  if (payload.companyId !== companyId || payload.userId !== userId) throw new AppError(403, 'PROPUESTA_AJENA', 'La propuesta no pertenece a esta sesión.');
  const existing = await prisma.reservation.findFirst({ where: { companyId, code: payload.code as string }, include: FULL_INCLUDE });
  if (existing) return serializeReservation(existing);
  const input = createReservationSchema.parse(payload.input);
  const result = await createReservation(input, { idempotencyCode: payload.code as string, expectedTotal: payload.total as number, source: 'STAFF', skipPaymentLink: true });
  console.log('[ai] reserva interna confirmada', { companyId, userId, reservationId: result.id });
  return result;
}
