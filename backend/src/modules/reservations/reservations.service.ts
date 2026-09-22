import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { decToNum, round2 } from '../../lib/money.js';
import { nightsBetween, parseDate } from '../../lib/date.js';
import type { CreateReservationInput, ServiceInput, UpdateReservationInput } from './reservations.schema.js';

export interface ReservationRow {
  id: number;
  code: string;
  roomId: number;
  guestId: number;
  checkIn: Date;
  checkOut: Date;
  status: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  room?: {
    id: number;
    number: string;
    name: string | null;
    capacity: number;
    price: unknown;
    type?: { id: number; name: string } | null;
  } | null;
  guest?: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
  } | null;
  services?: {
    id: number;
    serviceId: number;
    quantity: number;
    unitPrice: unknown;
    service?: { id: number; name: string } | null;
  }[];
  payments?: {
    id: number;
    amount: unknown;
    method: string;
    paidAt: Date;
    reference: string | null;
  }[];
}

export const FULL_INCLUDE = {
  room: { include: { type: true } },
  guest: true,
  services: { include: { service: true } },
  payments: { orderBy: { paidAt: 'desc' } },
} as const;

export function serializeReservation(row: ReservationRow) {
  const nights = nightsBetween(row.checkIn, row.checkOut);
  const roomPrice = decToNum(row.room?.price);
  const roomTotal = round2(nights * roomPrice);
  const servicesTotal = round2(
    (row.services ?? []).reduce((acc, s) => acc + s.quantity * decToNum(s.unitPrice), 0),
  );
  const total = round2(roomTotal + servicesTotal);
  const amountPaid = round2((row.payments ?? []).reduce((acc, p) => acc + decToNum(p.amount), 0));
  const balance = round2(total - amountPaid);

  return {
    id: row.id,
    code: row.code,
    roomId: row.roomId,
    guestId: row.guestId,
    checkIn: row.checkIn.toISOString().slice(0, 10),
    checkOut: row.checkOut.toISOString().slice(0, 10),
    status: row.status,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    room: row.room
      ? {
          id: row.room.id,
          number: row.room.number,
          name: row.room.name,
          capacity: row.room.capacity,
          price: roomPrice,
          type: row.room.type,
        }
      : null,
    guest: row.guest,
    services: (row.services ?? []).map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      name: s.service?.name ?? null,
      quantity: s.quantity,
      unitPrice: decToNum(s.unitPrice),
      lineTotal: round2(s.quantity * decToNum(s.unitPrice)),
    })),
    payments: (row.payments ?? []).map((p) => ({
      id: p.id,
      amount: decToNum(p.amount),
      method: p.method,
      paidAt: p.paidAt,
      reference: p.reference,
    })),
    totals: {
      nights,
      roomPrice,
      roomTotal,
      servicesTotal,
      total,
      amountPaid,
      balance,
    },
  };
}

function assertValidRange(checkIn: Date, checkOut: Date): void {
  const nights = nightsBetween(checkIn, checkOut);
  if (nights <= 0) throw badRequest('checkOut debe ser posterior a checkIn');
}

function generateCode(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `RSV-${Date.now().toString(36).toUpperCase()}${rand}`;
}

async function loadServices(items: ServiceInput[]) {
  const ids = [...new Set(items.map((i) => i.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: ids }, isActive: true },
  });
  if (services.length !== ids.length) throw notFound('Servicio');

  const byId = new Map(services.map((s) => [s.id, s]));
  return items.map((item) => {
    const service = byId.get(item.serviceId)!;
    return { id: service.id, quantity: item.quantity, price: service.price };
  });
}

export async function createReservation(input: CreateReservationInput) {
  const checkIn = parseDate(input.checkIn, 'checkIn');
  const checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);

  const room = await prisma.room.findFirst({ where: { id: input.roomId, isActive: true } });
  if (!room) throw notFound('Habitación', input.roomId);

  const services = await loadServices(input.services ?? []);

  return prisma.$transaction(async (tx) => {
    const conflictReservation = await tx.reservation.findFirst({
      where: {
        roomId: input.roomId,
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
      select: { id: true, code: true },
    });
    if (conflictReservation) {
      throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${conflictReservation.code})`);
    }

    let guestId: number;
    if (input.guestId !== undefined) {
      const guest = await tx.guest.findUnique({ where: { id: input.guestId } });
      if (!guest) throw notFound('Huésped', input.guestId);
      guestId = guest.id;
    } else {
      const guest = input.guest!;
      const upserted = await tx.guest.upsert({
        where: { email: guest.email },
        update: { firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone },
        create: guest,
      });
      guestId = upserted.id;
    }

    const reservation = await tx.reservation.create({
      data: {
        code: generateCode(),
        roomId: input.roomId,
        guestId,
        checkIn,
        checkOut,
        notes: input.notes,
        services: {
          create: services.map((s) => ({ serviceId: s.id, quantity: s.quantity, unitPrice: s.price })),
        },
      },
      include: FULL_INCLUDE,
    });

    return serializeReservation(reservation);
  });
}

export async function updateReservation(id: number, input: UpdateReservationInput) {
  const existing = await prisma.reservation.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!existing) throw notFound('Reserva', id);
  if (existing.status !== 'RESERVED') {
    throw conflict('INVALID_STATE', 'Solo una reserva en estado RESERVED puede modificarse');
  }

  let checkIn = existing.checkIn;
  let checkOut = existing.checkOut;
  if (input.checkIn !== undefined) checkIn = parseDate(input.checkIn, 'checkIn');
  if (input.checkOut !== undefined) checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);

  let roomId = existing.roomId;
  const services = input.services !== undefined ? await loadServices(input.services) : undefined;

  return prisma.$transaction(async (tx) => {
    const conflictReservation = await tx.reservation.findFirst({
      where: {
        roomId,
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        NOT: { id },
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
      select: { id: true, code: true },
    });
    if (conflictReservation) {
      throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${conflictReservation.code})`);
    }

    let guestId = existing.guestId;
    if (input.guestId !== undefined) {
      const guest = await tx.guest.findUnique({ where: { id: input.guestId } });
      if (!guest) throw notFound('Huésped', input.guestId);
      guestId = guest.id;
    }
    if (input.guest !== undefined && input.guestId === undefined) {
      const upserted = await tx.guest.upsert({
        where: { email: input.guest.email },
        update: { firstName: input.guest.firstName, lastName: input.guest.lastName, phone: input.guest.phone },
        create: input.guest,
      });
      guestId = upserted.id;
    }

    if (roomId !== existing.roomId || input.checkIn !== undefined || input.checkOut !== undefined) {
      const room = await tx.room.findFirst({ where: { id: roomId, isActive: true } });
      if (!room) throw notFound('Habitación', roomId);
    }

    const updated = await tx.reservation.update({
      where: { id },
      data: {
        roomId,
        guestId,
        checkIn,
        checkOut,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(services !== undefined
          ? {
              services: {
                deleteMany: {},
                create: services.map((s) => ({ serviceId: s.id, quantity: s.quantity, unitPrice: s.price })),
              },
            }
          : {}),
      },
      include: FULL_INCLUDE,
    });

    return serializeReservation(updated);
  });
}

export async function getReservation(id: number) {
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!reservation) throw notFound('Reserva', id);
  return serializeReservation(reservation);
}

export async function changeStatus(id: number, status: 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED') {
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) throw notFound('Reserva', id);

  let data: Prisma.ReservationUpdateInput;

  if (status === 'CHECKED_IN') {
    if (reservation.status !== 'RESERVED') {
      throw conflict('INVALID_STATE', 'Solo una reserva RESERVED puede hacer check-in');
    }
    data = { status: 'CHECKED_IN', checkedInAt: new Date() };
  } else if (status === 'CHECKED_OUT') {
    if (reservation.status !== 'CHECKED_IN') {
      throw conflict('INVALID_STATE', 'Solo una reserva CHECKED_IN puede hacer check-out');
    }
    data = { status: 'CHECKED_OUT', checkedOutAt: new Date() };
  } else {
    if (reservation.status === 'CANCELLED') {
      throw conflict('INVALID_STATE', 'La reserva ya está cancelada');
    }
    if (reservation.status === 'CHECKED_OUT') {
      throw conflict('INVALID_STATE', 'No se puede cancelar una reserva finalizada');
    }
    data = { status: 'CANCELLED' };
  }

  const updated = await prisma.reservation.update({ where: { id }, data, include: FULL_INCLUDE });
  return serializeReservation(updated);
}