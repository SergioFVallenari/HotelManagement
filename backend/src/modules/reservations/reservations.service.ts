import { Prisma, type ServiceChargeType } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { decToNum, round2 } from '../../lib/money.js';
import { nightsBetween, parseDate, todayHotel } from '../../lib/date.js';
import { getTenantId } from '../../lib/tenant.js';
import type { CreateReservationInput, ServiceInput, UpdateReservationInput } from './reservations.schema.js';
import { createOrderForReservation, type OrderGuestData } from '../mercadopago/mp.checkout.js';

export interface ReservationRow {
  id: number;
  code: string;
  roomId: number;
  guestId: number;
  checkIn: Date;
  checkOut: Date;
  persons: number;
  extraBeds: number;
  status: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  refundEligible: boolean;
  refundAmount: unknown;
  refunded: boolean;
  refundedAt: Date | null;
  mpCheckoutUrl: string | null;
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
    personsCovered: number | null;
    unitPrice: unknown;
    service?: { id: number; name: string; chargeType: ServiceChargeType; isExtraBed: boolean } | null;
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
    persons: row.persons,
    extraBeds: row.extraBeds,
    status: row.status,
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    cancelledAt: row.cancelledAt,
    refundEligible: row.refundEligible,
    refundAmount: row.refundAmount === null || row.refundAmount === undefined ? null : decToNum(row.refundAmount),
    refunded: row.refunded,
    refundedAt: row.refundedAt,
    mpCheckoutUrl: row.mpCheckoutUrl,
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
      chargeType: s.service?.chargeType ?? null,
      isExtraBed: s.service?.isExtraBed ?? false,
      personsCovered: s.personsCovered,
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

function computeQuantity(
  chargeType: ServiceChargeType,
  ctx: { persons: number; extraBeds: number; nights: number },
  requested?: number,
  isExtraBed = false,
): number {
  switch (chargeType) {
    case 'PER_PERSON':
      return (requested ?? (ctx.persons + ctx.extraBeds)) * ctx.nights;
    case 'PER_DAY':
      if (isExtraBed) return ctx.extraBeds > 0 ? ctx.extraBeds * ctx.nights : ctx.nights;
      return ctx.nights;
    case 'PACK':
      return requested ?? 1;
  }
}

async function loadServices(items: ServiceInput[], ctx: { persons: number; extraBeds: number; nights: number }) {
  const ids = [...new Set(items.map((i) => i.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: ids }, isActive: true },
  });
  if (services.length !== ids.length) throw notFound('Servicio');

  const byId = new Map(services.map((s) => [s.id, s]));
  return items.map((item) => {
    const service = byId.get(item.serviceId)!;
    const maxPersons = ctx.persons + ctx.extraBeds;
    if (service.chargeType === 'PER_PERSON' && item.personsCovered != null && (item.personsCovered < 1 || item.personsCovered > maxPersons)) {
      throw badRequest(`La cantidad de personas del servicio "${service.name}" debe estar entre 1 y ${maxPersons}`);
    }
    return {
      id: service.id,
      chargeType: service.chargeType,
      isExtraBed: service.isExtraBed,
      quantity: computeQuantity(
        service.chargeType,
        ctx,
        service.chargeType === 'PACK' ? item.quantity : service.chargeType === 'PER_PERSON' ? (item.personsCovered ?? undefined) : undefined,
        service.isExtraBed,
      ),
      personsCovered: service.chargeType === 'PER_PERSON' && item.personsCovered != null ? item.personsCovered : null,
      price: service.price,
    };
  });
}

export async function createReservation(input: CreateReservationInput) {
  const checkIn = parseDate(input.checkIn, 'checkIn');
  const checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);
  const companyId = getTenantId()!;

  const room = await prisma.room.findFirst({ where: { id: input.roomId, isActive: true, companyId } });
  if (!room) throw notFound('Habitación', input.roomId);

  const persons = input.persons;
  if (persons > room.capacity) {
    throw badRequest(`La habitación admite hasta ${room.capacity} personas`);
  }
  const extraBeds = input.extraBeds ?? 0;
  if (extraBeds > room.maxExtraBeds) {
    throw badRequest(`La habitación admite hasta ${room.maxExtraBeds} cama(s) extra(s)`);
  }
  if (extraBeds > 0 && persons < room.capacity) {
    throw badRequest('Las camas extras solo pueden cargarse cuando la habitación está llena (personas = capacidad)');
  }

  const nights = nightsBetween(checkIn, checkOut);
  const services = await loadServices(input.services ?? [], { persons, extraBeds, nights });

  const roomPrice = decToNum(room.price);
  const total = round2(nights * roomPrice + round2(services.reduce((acc, s) => acc + s.quantity * decToNum(s.price), 0)));
  const code = generateCode();
  const wantPaymentLink = input.generatePaymentLink === true;

  let order: { orderId: string; checkoutUrl: string } | undefined;
  if (wantPaymentLink) {
    let guestContext: OrderGuestData | undefined;
    if (input.guest) {
      guestContext = {
        email: input.guest.email,
        firstName: input.guest.firstName,
        lastName: input.guest.lastName,
      };
    } else if (input.guestId !== undefined) {
      const existingGuest = await prisma.guest.findUnique({
        where: { id: input.guestId, companyId },
        select: { email: true, firstName: true, lastName: true },
      });
      if (existingGuest) guestContext = existingGuest;
    }
    order = await createOrderForReservation({ companyId, code, amount: total, guest: guestContext, checkIn: input.checkIn });
  }

  return prisma.$transaction(async (tx) => {
    const conflictReservation = await tx.reservation.findFirst({
      where: {
        companyId,
        roomId: input.roomId,
        status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] },
        AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
      },
      select: { id: true, code: true },
    });
    if (conflictReservation) {
      throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${conflictReservation.code})`);
    }

    let guestId: number;
    if (input.guestId !== undefined) {
      const guest = await tx.guest.findUnique({ where: { id: input.guestId, companyId } });
      if (!guest) throw notFound('Huésped', input.guestId);
      guestId = guest.id;
    } else {
      const guest = input.guest!;
      const upserted = await tx.guest.upsert({
        where: { companyId_email: { companyId, email: guest.email } },
        update: { firstName: guest.firstName, lastName: guest.lastName, phone: guest.phone },
        create: { ...guest, companyId },
      });
      guestId = upserted.id;
    }

    const reservation = await tx.reservation.create({
      data: {
        code,
        roomId: input.roomId,
        guestId,
        companyId,
        checkIn,
        checkOut,
        persons,
        extraBeds,
        notes: input.notes,
        status: wantPaymentLink ? 'PENDING' : 'RESERVED',
        ...(order ? { mpOrderId: order.orderId, mpCheckoutUrl: order.checkoutUrl } : {}),
        services: {
          create: services.map((s) => ({ serviceId: s.id, quantity: s.quantity, personsCovered: s.personsCovered, unitPrice: s.price })),
        },
      },
      include: FULL_INCLUDE,
    });

    return serializeReservation(reservation);
  });
}

export async function updateReservation(id: number, input: UpdateReservationInput) {
  const companyId = getTenantId()!;
  const existing = await prisma.reservation.findUnique({
    where: { id, companyId },
    include: FULL_INCLUDE,
  });
  if (!existing) throw notFound('Reserva', id);
  if (existing.status !== 'RESERVED') {
    throw conflict('INVALID_STATE', 'Solo una reserva en estado RESERVED puede modificarse');
  }

  let checkIn = existing.checkIn;
  let checkOut = existing.checkOut;
  if (input.checkIn !== undefined) checkIn = parseDate(input.checkIn, 'checkIn');
  if (input.checkOut !== undefined) checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);

  const persons = input.persons ?? existing.persons;
  const extraBeds = input.extraBeds ?? existing.extraBeds;
  const nights = nightsBetween(checkIn, checkOut);

  let roomId = existing.roomId;
  if (input.roomId !== undefined) roomId = input.roomId;
  const contextChanged =
    input.checkIn !== undefined ||
    input.checkOut !== undefined ||
    (input.persons !== undefined && input.persons !== existing.persons) ||
    (input.extraBeds !== undefined && input.extraBeds !== existing.extraBeds) ||
    roomId !== existing.roomId;
  const roomOrContextChanged = roomId !== existing.roomId || contextChanged;

  const services = input.services !== undefined ? await loadServices(input.services, { persons, extraBeds, nights }) : undefined;

  return prisma.$transaction(async (tx) => {
    const conflictReservation = await tx.reservation.findFirst({
      where: {
        companyId,
        roomId,
        status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] },
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
      const guest = await tx.guest.findUnique({ where: { id: input.guestId, companyId } });
      if (!guest) throw notFound('Huésped', input.guestId);
      guestId = guest.id;
    }
    if (input.guest !== undefined && input.guestId === undefined) {
      const upserted = await tx.guest.upsert({
        where: { companyId_email: { companyId, email: input.guest.email } },
        update: { firstName: input.guest.firstName, lastName: input.guest.lastName, phone: input.guest.phone },
        create: { ...input.guest, companyId },
      });
      guestId = upserted.id;
    }

    if (roomOrContextChanged) {
      const room = await tx.room.findFirst({ where: { id: roomId, isActive: true, companyId } });
      if (!room) throw notFound('Habitación', roomId);
      if (persons > room.capacity) {
        throw badRequest(`La habitación admite hasta ${room.capacity} personas`);
      }
      if (extraBeds > room.maxExtraBeds) {
        throw badRequest(`La habitación admite hasta ${room.maxExtraBeds} cama(s) extra(s)`);
      }
      if (extraBeds > 0 && persons < room.capacity) {
        throw badRequest('Las camas extras solo pueden cargarse cuando la habitación está llena (personas = capacidad)');
      }
    }

    const shouldRecomputeLines =
      services === undefined && contextChanged && (existing.services?.length ?? 0) > 0;

    const updated = await tx.reservation.update({
      where: { id, companyId },
      data: {
        roomId,
        guestId,
        checkIn,
        checkOut,
        ...(input.persons !== undefined ? { persons } : {}),
        ...(input.extraBeds !== undefined ? { extraBeds } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(services !== undefined
          ? {
              services: {
                deleteMany: {},
                create: services.map((s) => ({ serviceId: s.id, quantity: s.quantity, personsCovered: s.personsCovered, unitPrice: s.price })),
              },
            }
          : {}),
        ...(shouldRecomputeLines
          ? {
              services: {
                update: (existing.services ?? []).map((line) => {
                  const maxPersons = persons + extraBeds;
                  return {
                    where: { id: line.id },
                    data: {
                      quantity:
                        line.service.chargeType === 'PACK'
                          ? line.quantity
                          : computeQuantity(
                              line.service.chargeType,
                              { persons, extraBeds, nights },
                              line.service.chargeType === 'PER_PERSON'
                                ? line.personsCovered == null
                                  ? undefined
                                  : Math.min(line.personsCovered, maxPersons)
                                : undefined,
                              line.service.isExtraBed,
                            ),
                    },
                  };
                }),
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
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: { payments: { orderBy: { paidAt: 'desc' } } },
  });
  if (!reservation) throw notFound('Reserva', id);

  let data: Prisma.ReservationUpdateInput;

  if (status === 'CHECKED_IN') {
    if (reservation.status !== 'RESERVED') {
      throw conflict('INVALID_STATE', 'Solo una reserva RESERVED puede hacer check-in');
    }
    if (todayHotel() < reservation.checkIn) {
      const dateKey = reservation.checkIn.toISOString().slice(0, 10);
      throw conflict('CHECKIN_TOO_EARLY', `El check-in no puede realizarse antes del ${dateKey} (fecha de reserva)`);
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
    const daysUntilCheckIn = nightsBetween(todayHotel(), reservation.checkIn);
    const amountPaid = round2((reservation.payments ?? []).reduce((acc, p) => acc + decToNum(p.amount), 0));
    const refundEligible = daysUntilCheckIn >= 10 && amountPaid > 0;
    data = {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      refundEligible,
      refundAmount: refundEligible ? amountPaid : null,
      refunded: false,
      refundedAt: null,
    };
  }

  const updated = await prisma.reservation.update({ where: { id }, data, include: FULL_INCLUDE });
  return serializeReservation(updated);
}

export async function markRefunded(id: number) {
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) throw notFound('Reserva', id);
  if (reservation.status !== 'CANCELLED') {
    throw conflict('INVALID_STATE', 'Solo una reserva cancelada puede registrar devolución');
  }
  if (!reservation.refundEligible) {
    throw conflict('INVALID_STATE', 'Esta cancelación no corresponde a devolución');
  }
  if (reservation.refunded) {
    throw conflict('INVALID_STATE', 'La devolución ya fue registrada');
  }

  const updated = await prisma.reservation.update({
    where: { id },
    data: { refunded: true, refundedAt: new Date() },
    include: FULL_INCLUDE,
  });
  return serializeReservation(updated);
}