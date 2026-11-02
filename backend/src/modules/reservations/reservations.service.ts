import { Prisma, type ReservationSource, type ReservationStatus, type ServiceChargeType } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { decToNum, round2 } from '../../lib/money.js';
import { nightsBetween, parseDate, todayHotel, assertValidRange } from '../../lib/date.js';
import { quoteStay, roomStayTotal, serviceQuantity, type RoomPricingMode } from '../../lib/pricing.js';
import { getTenantId } from '../../lib/tenant.js';
import type { CreateReservationInput, ServiceInput, UpdateReservationInput } from './reservations.schema.js';
import { createOrderForReservation, type OrderGuestData } from '../mercadopago/mp.checkout.js';
import { roomSelectionsTotal, type RoomSnapshot } from '../../lib/reservationRooms.js';
import { loadReservationRooms, roomOverlapWhere } from './reservationRooms.service.js';

export interface ReservationRow {
  id: number;
  code: string;
  roomId: number;
  guestId: number;
  checkIn: Date;
  checkOut: Date;
  persons: number;
  extraBeds: number;
  roomPrice?: unknown;
  roomPricingMode?: RoomPricingMode | null;
  rooms?: { roomId: number; persons: number; extraBeds: number; roomPrice: unknown; roomPricingMode: RoomPricingMode; room?: ReservationRow['room'] }[];
  status: string;
  source?: string;
  checkedInAt: Date | null;
  checkedOutAt: Date | null;
  cancelledAt: Date | null;
  refundEligible: boolean;
  refundAmount: unknown;
  refunded: boolean;
  refundedAt: Date | null;
  mpCheckoutUrl: string | null;
  mpExpectedAmount: unknown;
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
    name?: string | null;
    description?: string | null;
    chargeType?: ServiceChargeType | null;
    intervalDays?: number | null;
    isExtraBed?: boolean | null;
    service?: { id: number; name: string; description?: string | null; intervalDays?: number | null; chargeType: ServiceChargeType; isExtraBed: boolean } | null;
  }[];
  payments?: {
    id: number;
    amount: unknown;
    method: string;
    paidAt: Date;
    reference: string | null;
  }[];
  receipt?: {
    id: number;
    fileName: string;
    mimeType: string;
    size: number;
    externalRef: string | null;
    createdAt: Date;
  } | null;
  bookingLink?: {
    id: number;
    token: string;
    status: string;
    deposit: unknown;
    expiresAt: Date | null;
  } | null;
}

export const FULL_INCLUDE = {
  rooms: { include: { room: { include: { type: true } } }, orderBy: { id: 'asc' } },
  room: { include: { type: true } },
  guest: true,
  services: { include: { service: true } },
  payments: { orderBy: { paidAt: 'desc' } },
  receipt: true,
  bookingLink: true,
} as const;

export function serializeReservation(row: ReservationRow) {
  const nights = nightsBetween(row.checkIn, row.checkOut);
  const roomPrice = decToNum(row.roomPrice ?? row.room?.price);
  const roomPricingMode = row.roomPricingMode ?? 'PER_NIGHT';
  const quoted = quoteStay(nights, 0, (row.services ?? []).map((s) => ({ quantity: s.quantity, unitPrice: decToNum(s.unitPrice) })));
  const rooms = row.rooms?.length ? row.rooms : [{ roomId: row.roomId, persons: row.persons, extraBeds: row.extraBeds, roomPrice, roomPricingMode, room: row.room }];
  const roomTotal = roomSelectionsTotal(rooms.map((line) => ({ ...line, roomPrice: decToNum(line.roomPrice) })), nights);
  const servicesTotal = quoted.servicesTotal;
  const total = round2(roomTotal + servicesTotal);
  const amountPaid = round2((row.payments ?? []).reduce((acc, p) => acc + decToNum(p.amount), 0));
  const balance = round2(total - amountPaid);

  return {
    id: row.id,
    code: row.code,
    roomId: row.roomId,
    rooms: rooms.map((line) => ({ roomId: line.roomId, persons: line.persons, extraBeds: line.extraBeds, roomPrice: decToNum(line.roomPrice), roomPricingMode: line.roomPricingMode, room: line.room ? { ...line.room, price: decToNum(line.roomPrice), pricingMode: line.roomPricingMode } : null, total: roomStayTotal(line.roomPricingMode, decToNum(line.roomPrice), nights, line.persons) })),
    guestId: row.guestId,
    checkIn: row.checkIn.toISOString().slice(0, 10),
    checkOut: row.checkOut.toISOString().slice(0, 10),
    persons: row.persons,
    extraBeds: row.extraBeds,
    status: row.status,
    source: row.source ?? 'STAFF',
    checkedInAt: row.checkedInAt,
    checkedOutAt: row.checkedOutAt,
    cancelledAt: row.cancelledAt,
    refundEligible: row.refundEligible,
    refundAmount: row.refundAmount === null || row.refundAmount === undefined ? null : decToNum(row.refundAmount),
    refunded: row.refunded,
    refundedAt: row.refundedAt,
    mpCheckoutUrl: row.mpCheckoutUrl,
    mpExpectedAmount: row.mpExpectedAmount === null || row.mpExpectedAmount === undefined ? null : decToNum(row.mpExpectedAmount),
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
           pricingMode: roomPricingMode,
          type: row.room.type,
        }
      : null,
    guest: row.guest,
    services: (row.services ?? []).map((s) => ({
      id: s.id,
      serviceId: s.serviceId,
      name: s.name ?? s.service?.name ?? null,
      description: s.name != null ? s.description ?? null : s.service?.description ?? null,
      intervalDays: s.name != null ? s.intervalDays ?? null : s.service?.intervalDays ?? null,
      chargeType: s.chargeType ?? s.service?.chargeType ?? null,
      isExtraBed: s.isExtraBed ?? s.service?.isExtraBed ?? false,
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
    receipt: row.receipt
      ? {
          id: row.receipt.id,
          fileName: row.receipt.fileName,
          mimeType: row.receipt.mimeType,
          size: row.receipt.size,
          externalRef: row.receipt.externalRef,
          createdAt: row.receipt.createdAt,
        }
      : null,
    bookingLink: row.bookingLink
      ? {
          id: row.bookingLink.id,
          token: row.bookingLink.token,
          status: row.bookingLink.status,
          deposit: decToNum(row.bookingLink.deposit),
          expiresAt: row.bookingLink.expiresAt,
        }
      : null,
    totals: {
      nights,
        roomPrice,
        roomPricingMode,
      roomTotal,
      servicesTotal,
      total,
      amountPaid,
      balance,
    },
  };
}

function generateCode(): string {
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, '0');
  return `RSV-${Date.now().toString(36).toUpperCase()}${rand}`;
}

export async function loadServices(items: ServiceInput[], ctx: { persons: number; extraBeds: number; nights: number; roomCount?: number }) {
  const ids = [...new Set(items.map((i) => i.serviceId))];
  const services = await prisma.service.findMany({
    where: { id: { in: ids }, isActive: true },
  });
  if (services.length !== ids.length) throw notFound('Servicio');

  const byId = new Map(services.map((s) => [s.id, s]));
  return items.map((item) => {
    const service = byId.get(item.serviceId)!;
    const maxPersons = ctx.persons;
    if (service.chargeType === 'PER_PERSON' && item.personsCovered != null && (item.personsCovered < 1 || item.personsCovered > maxPersons)) {
      throw badRequest(`La cantidad de personas del servicio "${service.name}" debe estar entre 1 y ${maxPersons}`);
    }
    return {
      id: service.id,
      name: service.name,
      description: service.description,
      intervalDays: service.intervalDays,
      chargeType: service.chargeType,
      isExtraBed: service.isExtraBed,
      quantity: serviceQuantity(
        service.chargeType,
        ctx,
        service.chargeType === 'PACK' ? item.quantity : service.chargeType === 'PER_PERSON' ? (item.personsCovered ?? ctx.persons) : undefined,
        service.isExtraBed,
        service.intervalDays,
      ),
      personsCovered: service.chargeType === 'PER_PERSON' && item.personsCovered != null ? item.personsCovered : null,
      price: service.price,
    };
  });
}

export interface ReservationReceiptInput {
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
  externalRef?: string | null;
}

export interface CreateReservationOptions {
  // Fuerza el estado inicial (las reservas que llegan por WhatsApp nacen PENDING).
  forceStatus?: ReservationStatus;
  // De donde sale la reserva.
  source?: ReservationSource;
  // No genera link de MercadoPago aunque el cuerpo pida anticipo.
  skipPaymentLink?: boolean;
  // Solicitud de WhatsApp que se reclama: el link pasa a COMPLETED dentro de la
  // misma transaccion que crea la reserva (asi un doble envio no duplica).
  bookingLinkId?: number;
  // Comprobante de pago que subio el huesped.
  receipt?: ReservationReceiptInput;
  roomPrice?: number;
  roomPricingMode?: RoomPricingMode;
  rooms?: RoomSnapshot[];
  serviceLines?: { serviceId: number; name?: string; description?: string | null; chargeType?: ServiceChargeType; intervalDays?: number | null; isExtraBed?: boolean; quantity: number; personsCovered: number | null; unitPrice: number }[];
}

export async function createReservation(input: CreateReservationInput, options: CreateReservationOptions = {}) {
  const checkIn = parseDate(input.checkIn, 'checkIn');
  const checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);
  const companyId = getTenantId()!;

  const rooms = await loadReservationRooms(input.rooms ?? [{ roomId: input.roomId!, persons: input.persons, extraBeds: input.extraBeds ?? 0 }], options.rooms);
  if (!options.rooms && options.roomPrice !== undefined) rooms[0]!.roomPrice = options.roomPrice;
  if (!options.rooms && options.roomPricingMode !== undefined) rooms[0]!.roomPricingMode = options.roomPricingMode;
  const persons = rooms.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = rooms.reduce((sum, line) => sum + line.extraBeds, 0);

  const nights = nightsBetween(checkIn, checkOut);
  const services = options.serviceLines ? [] : await loadServices(input.services ?? [], { persons, extraBeds, nights, roomCount: rooms.length });

  const roomPrice = rooms[0]!.roomPrice;
  const roomPricingMode = rooms[0]!.roomPricingMode;
  const serviceLines = options.serviceLines ?? services.map((s) => ({ serviceId: s.id, name: s.name, description: s.description, chargeType: s.chargeType, intervalDays: s.intervalDays, isExtraBed: s.isExtraBed, quantity: s.quantity, personsCovered: s.personsCovered, unitPrice: decToNum(s.price) }));
  const { servicesTotal } = quoteStay(nights, 0, serviceLines);
  const total = round2(roomSelectionsTotal(rooms, nights) + servicesTotal);
  const code = generateCode();

  const depositPayment = input.payment;
  const deposit = depositPayment ? round2(depositPayment.amount) : 0;
  if (deposit > total) {
    throw badRequest(`El anticipo no puede superar el total de la reserva (total: ${total})`);
  }
  const depositViaMp = depositPayment?.method === 'MERCADOPAGO';
  const orderAmount = depositViaMp ? deposit : round2(total - deposit);
  const overlapWhere: Prisma.ReservationWhereInput = {
    companyId,
    ...roomOverlapWhere(rooms.map((line) => line.roomId)),
    status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] },
    AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
  };
  const wantPaymentLink =
    !options.skipPaymentLink &&
    (depositViaMp ? orderAmount > 0 : input.generatePaymentLink === true && orderAmount > 0);

  let order: { orderId: string; checkoutUrl: string } | undefined;
  if (wantPaymentLink) {
    const occupied = await prisma.reservation.findFirst({ where: overlapWhere, select: { id: true, code: true } });
    if (occupied) {
      throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${occupied.code})`);
    }
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
    order = await createOrderForReservation({ companyId, code, amount: orderAmount, guest: guestContext, checkIn: input.checkIn });
  }

  return prisma.$transaction(async (tx) => {
    const roomIds = rooms.map((line) => line.roomId);
    await tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" IN (${Prisma.join(roomIds)}) AND "companyId" = ${companyId} ORDER BY "id" FOR UPDATE`;
    // Reclamo atomico de la solicitud de WhatsApp: el update condicional por
    // status OPEN hace que un segundo envio del huesped no cree otra reserva.
    if (options.bookingLinkId !== undefined) {
      const claimed = await tx.bookingLink.updateMany({
        where: { id: options.bookingLinkId, status: 'OPEN' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw conflict('LINK_ALREADY_USED', 'Esta solicitud de reserva ya fue enviada');
      }
    }

    const conflictReservation = await tx.reservation.findFirst({
      where: overlapWhere,
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
        roomId: rooms[0]!.roomId,
        rooms: { create: rooms.map(({ roomId, persons, extraBeds, roomPrice, roomPricingMode }) => ({ roomId, persons, extraBeds, roomPrice, roomPricingMode })) },
        guestId,
        companyId,
        checkIn,
        checkOut,
        persons,
        extraBeds,
        roomPrice: roomPrice,
        roomPricingMode,
        notes: input.notes,
        status: options.forceStatus ?? (wantPaymentLink ? 'PENDING' : 'RESERVED'),
        source: options.source ?? 'STAFF',
        ...(order ? { mpOrderId: order.orderId, mpCheckoutUrl: order.checkoutUrl, mpExpectedAmount: orderAmount } : {}),
        ...(options.receipt
          ? {
              receipt: {
                create: {
                  companyId,
                  storagePath: options.receipt.storagePath,
                  fileName: options.receipt.fileName,
                  mimeType: options.receipt.mimeType,
                  size: options.receipt.size,
                  externalRef: options.receipt.externalRef ?? null,
                },
              },
            }
          : {}),
        services: {
          create: serviceLines,
        },
      },
      include: FULL_INCLUDE,
    });

    if (options.bookingLinkId !== undefined) {
      await tx.bookingLink.update({
        where: { id: options.bookingLinkId },
        data: { reservationId: reservation.id },
      });
    }

    if (depositPayment === undefined || deposit <= 0 || depositViaMp) return serializeReservation(reservation);

    await tx.payment.create({
      data: {
        reservationId: reservation.id,
        amount: deposit,
        method: depositPayment.method,
        reference: depositPayment.reference,
      },
    });

    const withDeposit = await tx.reservation.findUniqueOrThrow({ where: { id: reservation.id }, include: FULL_INCLUDE });
    return serializeReservation(withDeposit);
  });
}

export async function updateReservation(id: number, input: UpdateReservationInput) {
  const companyId = getTenantId()!;
  const existing = await prisma.reservation.findUnique({
    where: { id, companyId },
    include: FULL_INCLUDE,
  });
  if (!existing) throw notFound('Reserva', id);
  if (existing.status !== 'RESERVED' && existing.status !== 'PENDING') {
    throw conflict('INVALID_STATE', 'Solo una reserva en estado RESERVED o PENDING puede modificarse');
  }

  let checkIn = existing.checkIn;
  let checkOut = existing.checkOut;
  if (input.checkIn !== undefined) checkIn = parseDate(input.checkIn, 'checkIn');
  if (input.checkOut !== undefined) checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);

  const previousRooms = existing.rooms.length ? existing.rooms.map((line) => ({ ...line, roomPrice: decToNum(line.roomPrice), number: line.room.number, typeName: line.room.type.name, capacity: line.room.capacity })) : [{ roomId: existing.roomId, persons: existing.persons, extraBeds: existing.extraBeds, roomPrice: decToNum(existing.roomPrice ?? existing.room.price), roomPricingMode: existing.roomPricingMode ?? 'PER_NIGHT' as const, number: existing.room.number, typeName: existing.room.type.name, capacity: existing.room.capacity }];
  if (previousRooms.length > 1 && !input.rooms && (input.roomId !== undefined || input.persons !== undefined || input.extraBeds !== undefined)) throw badRequest('Para modificar una reserva grupal indicá las personas y camas extras de cada habitación');
  const selections = input.rooms ?? previousRooms.map((line) => ({ roomId: input.roomId ?? line.roomId, persons: input.persons ?? line.persons, extraBeds: input.extraBeds ?? line.extraBeds }));
  const rooms = await loadReservationRooms(selections, previousRooms);
  const persons = rooms.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = rooms.reduce((sum, line) => sum + line.extraBeds, 0);
  const nights = nightsBetween(checkIn, checkOut);

  const roomId = rooms[0]!.roomId;
  const contextChanged =
    input.rooms !== undefined ||
    input.checkIn !== undefined ||
    input.checkOut !== undefined ||
    (input.persons !== undefined && input.persons !== existing.persons) ||
    (input.extraBeds !== undefined && input.extraBeds !== existing.extraBeds) ||
    roomId !== existing.roomId;

  const services = input.services !== undefined ? await loadServices(input.services, { persons, extraBeds, nights, roomCount: rooms.length }) : undefined;

  return prisma.$transaction(async (tx) => {
    const roomIds = [...new Set([...rooms, ...previousRooms].map((line) => line.roomId))];
    await tx.$queryRaw`SELECT "id" FROM "Room" WHERE "id" IN (${Prisma.join(roomIds)}) AND "companyId" = ${companyId} ORDER BY "id" FOR UPDATE`;
    const conflictReservation = await tx.reservation.findFirst({
      where: {
        companyId,
        ...roomOverlapWhere(rooms.map((line) => line.roomId)),
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

    const shouldRecomputeLines =
      services === undefined && contextChanged && (existing.services?.length ?? 0) > 0;

    const updated = await tx.reservation.update({
      where: { id, companyId },
      data: {
        roomId,
        rooms: { deleteMany: {}, create: rooms.map(({ roomId, persons, extraBeds, roomPrice, roomPricingMode }) => ({ roomId, persons, extraBeds, roomPrice, roomPricingMode })) },
        roomPrice: rooms[0]!.roomPrice,
        roomPricingMode: rooms[0]!.roomPricingMode,
        guestId,
        checkIn,
        checkOut,
        persons,
        extraBeds,
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(services !== undefined
          ? {
              services: {
                deleteMany: {},
                create: services.map((s) => ({ serviceId: s.id, name: s.name, description: s.description, chargeType: s.chargeType, intervalDays: s.intervalDays, isExtraBed: s.isExtraBed, quantity: s.quantity, personsCovered: s.personsCovered, unitPrice: s.price })),
              },
            }
          : {}),
        ...(shouldRecomputeLines
          ? {
              services: {
                update: (existing.services ?? []).map((line) => {
                  const maxPersons = persons;
                  return {
                    where: { id: line.id },
                    data: {
                      quantity:
                        (line.chargeType ?? line.service.chargeType) === 'PACK'
                          ? line.quantity
                          : serviceQuantity(
                              line.chargeType ?? line.service.chargeType,
                              { persons, extraBeds, nights, roomCount: rooms.length },
                              (line.chargeType ?? line.service.chargeType) === 'PER_PERSON'
                                ? line.personsCovered == null
                                  ? persons
                                  : Math.min(line.personsCovered, maxPersons)
                                : undefined,
                              line.isExtraBed ?? line.service.isExtraBed,
                              line.name != null ? line.intervalDays : line.service.intervalDays,
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

export async function getPublicReservationByCode(code: string) {
  const reservation = await prisma.reservation.findFirst({
    where: { code: code.trim().toUpperCase(), source: 'PUBLIC_LINK' },
    include: { ...FULL_INCLUDE, company: { select: { name: true, configPage: true } } },
  });
  if (!reservation) throw notFound('Reserva', code);
  const serialized = serializeReservation(reservation);
  return {
    code: serialized.code,
    hotel: { name: reservation.company.name, configPage: reservation.company.configPage },
    status: serialized.status,
    checkIn: serialized.checkIn,
    checkOut: serialized.checkOut,
    persons: serialized.persons,
    roomType: reservation.room.type.name,
    rooms: serialized.rooms.map((line) => ({ roomType: line.room?.type?.name ?? 'Habitación', persons: line.persons, extraBeds: line.extraBeds, total: line.total })),
    nights: serialized.totals.nights,
    total: serialized.totals.total,
    amountPaid: serialized.totals.amountPaid,
    balance: serialized.totals.balance,
    createdAt: serialized.createdAt,
  };
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

// Aprobacion del comprobante que subio el huesped por el formulario de
// WhatsApp: PENDING -> RESERVED. El anticipo se registra en este momento
// (antes de verificar el comprobante el pago no existe: si la reserva se
// rechaza, los ingresos del hotel no se ven afectados).
export async function approveReservation(id: number) {
  const reservation = await prisma.reservation.findUnique({ where: { id }, include: FULL_INCLUDE });
  if (!reservation) throw notFound('Reserva', id);
  if (reservation.status !== 'PENDING') {
    throw conflict('INVALID_STATE', 'Solo una reserva PENDING puede aprobarse');
  }

  return prisma.$transaction(async (tx) => {
    const link = reservation.bookingLink;
    if (link && (reservation.payments?.length ?? 0) === 0) {
      await tx.payment.create({
        data: {
          reservationId: id,
          amount: decToNum(link.deposit),
          method: 'TRANSFER',
          reference: `FORM-${link.token.slice(0, 12).toUpperCase()}`,
        },
      });
    }

    const updated = await tx.reservation.update({
      where: { id },
      data: { status: 'RESERVED' },
      include: FULL_INCLUDE,
    });
    return serializeReservation(updated);
  });
}

// Rechazo del comprobante: la reserva se cancela y queda el motivo en las notas.
export async function rejectReservation(id: number, reason?: string | null) {
  const reservation = await prisma.reservation.findUnique({ where: { id } });
  if (!reservation) throw notFound('Reserva', id);
  if (reservation.status !== 'PENDING') {
    throw conflict('INVALID_STATE', 'Solo una reserva PENDING puede rechazarse');
  }

  const cancelled = await changeStatus(id, 'CANCELLED');
  const motivo = reason?.trim() ? `Rechazada: ${reason.trim()}` : 'Rechazada: el comprobante no pudo verificarse';
  const updated = await prisma.reservation.update({
    where: { id },
    data: { notes: [cancelled.notes, motivo].filter(Boolean).join('\n') },
    include: FULL_INCLUDE,
  });
  return serializeReservation(updated);
}
