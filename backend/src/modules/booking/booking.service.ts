import { randomUUID } from 'node:crypto';
import { getCalendar } from '../calendar/calendar.service.js';
import { publicCalendarData } from '../../lib/calendar.js';
import { Prisma, type BookingLinkStatus, type ServiceChargeType } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { decToNum, round2 } from '../../lib/money.js';
import { calculateDiscount } from '../../lib/discount.js';
import { assertValidRange, nightsBetween, parseDate, todayHotel } from '../../lib/date.js';
import { computeBookingDeposit, quoteStay } from '../../lib/pricing.js';
import { bookingRoomSnapshotsSchema } from './booking.schema.js';
import { getTenantId, withTenant } from '../../lib/tenant.js';
import { createReservation, getPublicReservationByCode, loadServices } from '../reservations/reservations.service.js';
import type {
  CreateBookingLinkInput,
  ListBookingLinksQuery,
  PublicBookingInput,
  PublicAvailabilityQuery,
  ReceiptUploadInput,
} from './booking.schema.js';
import { publicPageConfigSchema } from '../companies/companies.schema.js';
import { getBookingCapacity } from './booking.capacity.js';
import { availableInventoryRooms, quoteAvailabilityChoices } from '../../lib/availabilityChoices.js';
import { publicRoomTypeOptions, summarizeRoomCapacity } from '../../lib/bookingCapacity.js';
import { roomSelectionsTotal, type RoomSnapshot } from '../../lib/reservationRooms.js';
import { loadReservationRooms, roomOverlapWhere } from '../reservations/reservationRooms.service.js';
import { generateBookingToken } from './booking.token.js';
import { buildShareMessage, buildWhatsAppUrl } from './booking.share.js';
import { parseServiceLines, type BookingServiceLine } from './booking.lines.js';
import {
  ALLOWED_RECEIPT_TYPES,
  createReceiptUploadUrl,
  createReceiptUrl,
  extensionForMimeType,
  getReceiptInfo,
  MAX_RECEIPT_BYTES,
  mimeTypeForPath,
  removeReceipt,
} from './booking.storage.js';

// Vigencia por defecto del link que se manda por WhatsApp. Pasado ese plazo la
// solicitud deja de aceptarse (el hotel puede generar una nueva).
export const BOOKING_LINK_TTL_DAYS = 15;
export const DEFAULT_DEPOSIT_PERCENT = 20;

function publicBookingTheme(configPage: Prisma.JsonValue): unknown {
  const parsed = publicPageConfigSchema.safeParse(configPage);
  return parsed.success ? parsed.data.bookingTheme : null;
}

export async function getPublicBookingPageConfig(slug: string) {
  const company = await prisma.company.findUnique({
    where: { bookingSlug: slug.toLowerCase() },
    select: { id: true, name: true, whatsapp: true, phone: true, configPage: true },
  });
  if (!company) throw notFound('No encontramos este alojamiento');
  const config = publicPageConfigSchema.safeParse(company.configPage);
  const typesPromise = prisma.roomType.findMany({
    where: { companyId: company.id, rooms: { some: { companyId: company.id, isActive: true } } },
    select: { id: true, name: true, rooms: { where: { companyId: company.id, isActive: true }, select: { capacity: true, maxExtraBeds: true } } },
    orderBy: { name: 'asc' },
  });
  const [types, capacity] = await Promise.all([
    typesPromise,
    getBookingCapacity(company.id, company.configPage, undefined, typesPromise.then((types) => summarizeRoomCapacity(types.flatMap((type) => type.rooms)))),
  ]);
  return {
    hotel: {
      ...capacity,
      roomTypes: publicRoomTypeOptions(types, capacity.publicExtraBedsEnabled, config.success ? config.data.maxAvailabilityPersons : null),
      name: company.name,
      whatsapp: company.whatsapp,
      phone: company.phone,
      bookingTheme: publicBookingTheme(company.configPage),
    },
  };
}

export async function getPublicCalendar(slug: string, query: { from: string; to: string; roomTypeId: number }) {
  const company = await prisma.company.findUnique({ where: { bookingSlug: slug.toLowerCase() }, select: { id: true } });
  if (!company) throw notFound('No encontramos este alojamiento');
  const type = await prisma.roomType.findFirst({ where: { id: query.roomTypeId, companyId: company.id }, select: { name: true } });
  if (!type) throw badRequest('El tipo de habitación seleccionado no pertenece a este alojamiento');
  const calendar = await getCalendar({ ...query, companyId: company.id, publicView: true, roomTypeName: type.name });
  return publicCalendarData(calendar);
}

export async function getPublicAvailability(slug: string, query: PublicAvailabilityQuery) {
  const company = await prisma.company.findUnique({
    where: { bookingSlug: slug.toLowerCase() },
    select: { id: true, name: true, whatsapp: true, phone: true, configPage: true },
  });
  if (!company) throw notFound('No encontramos este alojamiento');

  const checkIn = parseDate(query.checkIn, 'checkIn');
  const checkOut = parseDate(query.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);
  if (checkIn < todayHotel()) throw badRequest('La fecha de entrada no puede ser anterior a hoy');
  const nights = nightsBetween(checkIn, checkOut);
  if (nights > 30) throw badRequest('La estadía no puede superar las 30 noches');

  const overlap: Prisma.ReservationWhereInput = { companyId: company.id, status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] }, checkIn: { lt: checkOut }, checkOut: { gt: checkIn } };
  const inventoryPromise = prisma.room.findMany({
    where: { companyId: company.id, isActive: true, ...(query.roomTypeId !== undefined ? { typeId: query.roomTypeId } : {}) },
    select: {
      id: true, number: true, name: true, typeId: true, capacity: true, maxExtraBeds: true, price: true, pricingMode: true, amenities: true,
      _count: { select: { reservations: { where: overlap }, reservationRooms: { where: { reservation: overlap } } } },
    },
    orderBy: { id: 'asc' },
  });
  const [inventory, types, capacity] = await Promise.all([
    inventoryPromise,
    prisma.roomType.findMany({
      where: { companyId: company.id, ...(query.roomTypeId !== undefined ? { id: query.roomTypeId } : {}) },
      select: { id: true, name: true },
    }),
    getBookingCapacity(company.id, company.configPage, query.roomTypeId, inventoryPromise.then(summarizeRoomCapacity)),
  ]);
  const typeNames = new Map(types.map((type) => [type.id, type.name]));
  const selectedRoomType = types.find((type) => type.id === query.roomTypeId);
  if (query.roomTypeId !== undefined && (!selectedRoomType || capacity.roomCount === 0)) throw badRequest('El tipo de habitación seleccionado no está habilitado para este alojamiento');
  const service = query.includeExtraBeds ? capacity.publicExtraBedService ?? undefined : undefined;
  const selectedRoom = query.roomId !== undefined ? inventory.find((room) => room.id === query.roomId) : null;
  if (query.roomId !== undefined && !selectedRoom) throw badRequest('La habitación seleccionada no está habilitada para este alojamiento y tipo');
  const hotelLimit = service ? capacity.maxAvailabilityPersonsWithExtraBeds : capacity.maxAvailabilityPersons;
  const maxAvailabilityPersons = selectedRoom ? Math.min(hotelLimit, selectedRoom.capacity + (service ? selectedRoom.maxExtraBeds : 0)) : hotelLimit;
  const roomCount = capacity.roomCount;
  if (query.roomCount && query.roomCount > roomCount) throw badRequest('La cantidad solicitada supera las habitaciones habilitadas para esta búsqueda');
  if (query.roomCount && query.roomCount > query.persons) throw badRequest('La cantidad de habitaciones no puede superar la cantidad de personas');
  if (query.persons > maxAvailabilityPersons) {
    throw badRequest(`La consulta admite hasta ${maxAvailabilityPersons} personas.`);
  }

  const rooms = availableInventoryRooms(inventory, query.roomId);

  const choices = quoteAvailabilityChoices({
    rooms: rooms.map((room) => ({
      id: room.id,
      typeId: room.typeId,
      roomType: typeNames.get(room.typeId)!,
      capacity: room.capacity,
      maxExtraBeds: room.maxExtraBeds,
      price: decToNum(room.price),
      pricingMode: room.pricingMode,
      amenities: room.amenities,
    })),
    persons: query.persons,
    selectedRoomId: query.roomId,
    nights,
    roomCount: query.roomCount,
    roomPersons: query.roomPersons,
    extraBedService: service,
    publicServices: capacity.publicServices,
    services: query.services ?? [],
  });

  return {
    hotel: {
      name: company.name,
      whatsapp: company.whatsapp,
      phone: company.phone,
      bookingTheme: publicBookingTheme(company.configPage),
    },
    stay: {
      checkIn: query.checkIn, checkOut: query.checkOut, nights, persons: query.persons,
      includesExtraBeds: service !== undefined, roomType: (selectedRoom ? typeNames.get(selectedRoom.typeId) : selectedRoomType?.name) ?? null,
      ...(selectedRoom ? { room: { id: selectedRoom.id, number: selectedRoom.number, name: selectedRoom.name, capacity: selectedRoom.capacity, maxExtraBeds: selectedRoom.maxExtraBeds } } : {}),
    },
    availableRoomCount: rooms.length,
    ...choices,
    availableRoomCapacity: rooms.reduce((max, room) => Math.max(max, room.capacity), 0),
  };
}

interface BookingLinkRow {
  id: number;
  token: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  persons: number;
  extraBeds: number;
  roomPrice?: unknown;
  roomPricingMode?: 'PER_NIGHT' | 'PER_PERSON' | null;
  services: unknown;
  rooms?: unknown;
  total: unknown;
  discountType?: 'PERCENTAGE' | 'FIXED' | null;
  discountValue?: unknown;
  discountAmount?: unknown;
  deposit: unknown;
  expiresAt: Date | null;
  createdAt: Date;
  completedAt: Date | null;
  room?: {
    id: number;
    number: string;
    name: string | null;
    capacity: number;
    price: unknown;
    pricingMode: 'PER_NIGHT' | 'PER_PERSON';
    type?: { id: number; name: string } | null;
  } | null;
  reservation?: { id: number; code: string; status: string } | null;
  company?: { id: number; name: string; whatsapp: string | null; phone: string | null; configPage: Prisma.JsonValue } | null;
}

const LINK_INCLUDE = {
  room: { include: { type: true } },
  reservation: { select: { id: true, code: true, status: true } },
  company: { select: { id: true, name: true, whatsapp: true, phone: true, configPage: true, bookingSlug: true } },
} as const;

function bookingRooms(row: BookingLinkRow): RoomSnapshot[] {
  const parsed = bookingRoomSnapshotsSchema.safeParse(row.rooms);
  if (parsed.success && parsed.data.length) return parsed.data;
  if (!row.room) return [];
  return [{ roomId: row.room.id, persons: row.persons, extraBeds: row.extraBeds, roomPrice: decToNum(row.roomPrice ?? row.room.price), roomPricingMode: row.roomPricingMode ?? row.room.pricingMode, number: row.room.number, typeName: row.room.type?.name ?? 'Habitación', capacity: row.room.capacity }];
}

function roomLabel(room: BookingLinkRow['room']): string {
  if (!room) return 'Habitación';
  const type = room.type?.name ?? 'Habitación';
  return room.number ? `${type} ${room.number}` : type;
}

function toIsoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function servicesTotalOf(lines: BookingServiceLine[]): number {
  return round2(lines.reduce((acc, l) => acc + l.lineTotal, 0));
}

export function buildBookingUrl(token: string): string {
  return `${env.frontendUrl.replace(/\/+$/, '')}/reserva/${token}`;
}

export function serializeBookingLink(row: BookingLinkRow) {
  const nights = nightsBetween(row.checkIn, row.checkOut);
  const lines = parseServiceLines(row.services);
  const total = decToNum(row.total);
  const deposit = decToNum(row.deposit);
  const url = buildBookingUrl(row.token);
  const servicesTotal = servicesTotalOf(lines);
  const message = row.company
    ? buildShareMessage({
        hotelName: row.company.name,
        roomLabel: bookingRooms(row).map((line) => `${line.typeName} ${line.number} (${line.persons} personas)`).join(' + '),
        checkIn: toIsoDate(row.checkIn),
        checkOut: toIsoDate(row.checkOut),
        nights,
        total,
        deposit,
        discountAmount: decToNum(row.discountAmount),
        url,
        services: lines,
      })
    : '';

  return {
    id: row.id,
    discount: row.discountType ? { type: row.discountType, value: decToNum(row.discountValue) } : null,
    token: row.token,
    url,
    status: row.status,
    checkIn: toIsoDate(row.checkIn),
    checkOut: toIsoDate(row.checkOut),
    nights,
    persons: row.persons,
    rooms: bookingRooms(row),
    extraBeds: row.extraBeds,
    room: row.room
      ? {
          id: row.room.id,
          number: row.room.number,
          typeName: row.room.type?.name ?? null,
          capacity: row.room.capacity,
          price: decToNum(row.roomPrice ?? row.room.price),
          pricingMode: row.roomPricingMode ?? row.room.pricingMode,
          label: roomLabel(row.room),
        }
      : null,
    services: lines,
    totals: {
      roomTotal: round2(total + decToNum(row.discountAmount) - servicesTotal),
      subtotal: round2(total + decToNum(row.discountAmount)),
      discountAmount: decToNum(row.discountAmount),
      servicesTotal,
      total,
      deposit,
      balance: round2(total - deposit),
    },
    roomPricingMode: row.roomPricingMode ?? row.room?.pricingMode ?? 'PER_NIGHT',
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    reservation: row.reservation ?? null,
    share: row.company
      ? { message, whatsappUrl: buildWhatsAppUrl(message, row.company.whatsapp) }
      : null,
  };
}

// Vista publica: sin numero de habitacion ni ids internos, solo lo que el
// huesped necesita para decidir y transferir.
export function serializePublicQuote(row: BookingLinkRow) {
  const nights = nightsBetween(row.checkIn, row.checkOut);
  const lines = parseServiceLines(row.services);
  const total = decToNum(row.total);
  const deposit = decToNum(row.deposit);
  const servicesTotal = servicesTotalOf(lines);

  return {
    discount: row.discountType ? { type: row.discountType, value: decToNum(row.discountValue) } : null,
    hotel: {
      name: row.company?.name ?? 'Hotel',
      whatsapp: row.company?.whatsapp ?? null,
      phone: row.company?.phone ?? null,
      bookingTheme: row.company ? publicBookingTheme(row.company.configPage) : null,
    },
    stay: {
      checkIn: toIsoDate(row.checkIn),
      checkOut: toIsoDate(row.checkOut),
      nights,
      persons: row.persons,
      extraBeds: row.extraBeds,
      roomType: row.room?.type?.name ?? 'Habitación',
      roomCapacity: row.room?.capacity ?? null,
      roomPricingMode: row.roomPricingMode ?? row.room?.pricingMode ?? 'PER_NIGHT',
      rooms: bookingRooms(row).map((line) => ({ roomType: line.typeName, capacity: line.capacity, persons: line.persons, extraBeds: line.extraBeds, total: roomSelectionsTotal([line], nights) })),
    },
    services: lines.map((l) => ({
      name: l.name,
      description: l.description ?? null,
      chargeType: l.chargeType,
      intervalDays: l.intervalDays ?? null,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    totals: {
      roomTotal: round2(total + decToNum(row.discountAmount) - servicesTotal),
      subtotal: round2(total + decToNum(row.discountAmount)),
      discountAmount: decToNum(row.discountAmount),
      servicesTotal,
      total,
      deposit,
      balance: round2(total - deposit),
    },
    expiresAt: row.expiresAt,
  };
}

export async function createBookingLink(input: CreateBookingLinkInput) {
  const companyId = getTenantId()!;
  const checkIn = parseDate(input.checkIn, 'checkIn');
  const checkOut = parseDate(input.checkOut, 'checkOut');
  assertValidRange(checkIn, checkOut);

  const rooms = await loadReservationRooms(input.rooms ?? [{ roomId: input.roomId!, persons: input.persons, extraBeds: input.extraBeds }]);
  const persons = rooms.reduce((sum, line) => sum + line.persons, 0);
  const extraBeds = rooms.reduce((sum, line) => sum + line.extraBeds, 0);

  const overlap = await prisma.reservation.findFirst({
    where: {
      companyId,
      ...roomOverlapWhere(rooms.map((line) => line.roomId)),
      status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] },
      AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
    },
    select: { code: true },
  });
  if (overlap) {
    throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${overlap.code})`);
  }

  const nights = nightsBetween(checkIn, checkOut);
  const services = await loadServices(input.services, { persons, extraBeds, nights, roomCount: rooms.length });
  const lines: BookingServiceLine[] = services.map((s) => ({
    serviceId: s.id,
    name: s.name,
    description: s.description,
    intervalDays: s.intervalDays,
    isExtraBed: s.isExtraBed,
    chargeType: s.chargeType,
    quantity: s.quantity,
    personsCovered: s.personsCovered,
    unitPrice: decToNum(s.price),
    lineTotal: round2(s.quantity * decToNum(s.price)),
  }));

  const roomPrice = rooms[0]!.roomPrice;
  const roomPricingMode = rooms[0]!.roomPricingMode;
  const { servicesTotal } = quoteStay(nights, 0, lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })));
  const { total, discountAmount } = calculateDiscount(round2(roomSelectionsTotal(rooms, nights) + servicesTotal), input.discount);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { bookingDepositPercent: true },
  });
  const percent = company?.bookingDepositPercent ?? DEFAULT_DEPOSIT_PERCENT;
  const deposit =
    input.deposit != null
      ? round2(Math.min(round2(input.deposit), total))
      : computeBookingDeposit(total, percent);
  if (deposit <= 0 && total > 0) {
    throw badRequest(
      'El anticipo no puede ser 0: configurá el porcentaje de anticipo en Ajustes o indicá un monto para esta solicitud',
    );
  }

  const ttlDays = input.expiresInDays ?? BOOKING_LINK_TTL_DAYS;
  const link = await prisma.bookingLink.create({
    data: {
      token: generateBookingToken(),
      companyId,
      roomId: rooms[0]!.roomId,
      rooms: rooms as unknown as Prisma.InputJsonValue,
      checkIn,
      checkOut,
      persons,
      extraBeds,
      roomPrice,
      roomPricingMode,
      services: lines as unknown as Prisma.InputJsonValue,
      total,
      discountType: input.discount?.type ?? null,
      discountValue: input.discount?.value ?? 0,
      discountAmount,
      deposit,
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    },
    include: LINK_INCLUDE,
  });
  return serializeBookingLink(link);
}

export async function listBookingLinks(query: ListBookingLinksQuery) {
  const rows = await prisma.bookingLink.findMany({
    where: query.status ? { status: query.status } : {},
    include: LINK_INCLUDE,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  return rows.map(serializeBookingLink);
}

export async function getBookingLink(id: number) {
  const row = await prisma.bookingLink.findUnique({ where: { id }, include: LINK_INCLUDE });
  if (!row) throw notFound('Solicitud de reserva', id);
  return serializeBookingLink(row);
}

export async function cancelBookingLink(id: number) {
  const row = await prisma.bookingLink.findUnique({ where: { id } });
  if (!row) throw notFound('Solicitud de reserva', id);
  if (row.status === 'COMPLETED') {
    throw conflict('LINK_ALREADY_USED', 'La solicitud ya fue enviada por el huésped y no se puede cancelar');
  }
  const updated = await prisma.bookingLink.update({
    where: { id },
    data: { status: 'CANCELLED' },
    include: LINK_INCLUDE,
  });
  return serializeBookingLink(updated);
}

// Busca el link por token. La query va sin tenant (el token es el secreto):
// recien despues se abre el contexto de la empresa duena del link.
async function findLinkByToken(token: string) {
  const row = await prisma.bookingLink.findUnique({ where: { token }, include: LINK_INCLUDE });
  if (!row) throw notFound('La solicitud de reserva no existe');
  return row;
}

function assertLinkUsable(status: BookingLinkStatus, expiresAt: Date | null): void {
  if (status === 'COMPLETED') {
    throw conflict('LINK_ALREADY_USED', 'Esta solicitud de reserva ya fue enviada');
  }
  if (status === 'CANCELLED') {
    throw conflict('LINK_CANCELLED', 'Esta solicitud de reserva ya no está disponible');
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) {
    throw conflict('LINK_EXPIRED', 'Esta solicitud de reserva venció. Pedile al hotel que te genere una nueva');
  }
}

export async function getPublicQuote(token: string) {
  const row = await findLinkByToken(token);
  if (row.status === 'COMPLETED') {
    throw conflict('LINK_ALREADY_USED', 'Esta solicitud de reserva ya fue enviada');
  }
  if (row.status === 'CANCELLED') {
    throw conflict('LINK_CANCELLED', 'Esta solicitud de reserva ya no está disponible');
  }
  const expired = Boolean(row.expiresAt && row.expiresAt.getTime() < Date.now());
  return { ...serializePublicQuote(row), expired };
}

export async function getPublicReservationStatus(code: string) {
  const result = await getPublicReservationByCode(code);
  return {
    ...result,
    hotel: {
      name: result.hotel.name,
      bookingTheme: publicBookingTheme(result.hotel.configPage as Prisma.JsonValue),
    },
  };
}

function receiptPrefix(companyId: number, token: string): string {
  return `company-${companyId}/${token}/`;
}

// Paso 1: valida el link y devuelve la URL firmada para subir el comprobante.
export async function createReceiptUpload(token: string, input: ReceiptUploadInput) {
  const row = await findLinkByToken(token);
  assertLinkUsable(row.status as BookingLinkStatus, row.expiresAt);

  if (!ALLOWED_RECEIPT_TYPES.includes(input.mimeType)) {
    throw badRequest('El comprobante tiene que ser una imagen (JPG, PNG, WEBP) o un PDF');
  }
  if (input.size > MAX_RECEIPT_BYTES) {
    throw badRequest('El comprobante no puede superar los 5 MB');
  }

  const companyId = row.company?.id;
  if (!companyId) throw notFound('La solicitud de reserva no existe');

  const path = `${receiptPrefix(companyId, row.token)}${randomUUID()}${extensionForMimeType(input.mimeType)}`;
  const { signedUrl, token: uploadToken } = await createReceiptUploadUrl(path);
  return { path, signedUrl, token: uploadToken };
}

// Paso 2: crea la reserva PENDING con el comprobante ya subido a Storage.
export async function submitBooking(token: string, guest: PublicBookingInput) {
  const row = await findLinkByToken(token);
  assertLinkUsable(row.status as BookingLinkStatus, row.expiresAt);

  const companyId = row.company?.id;
  if (!companyId) throw notFound('La solicitud de reserva no existe');

  const deposit = decToNum(row.deposit);
  const receiptPath = guest.receiptPath?.trim() || null;

  if (deposit > 0 && !receiptPath) {
    throw badRequest('Falta el comprobante de pago del anticipo');
  }

  let receipt: { storagePath: string; fileName: string; mimeType: string; size: number } | null = null;
  if (receiptPath) {
    if (!receiptPath.startsWith(receiptPrefix(companyId, row.token))) {
      throw badRequest('El comprobante no corresponde a esta solicitud de reserva');
    }
    const info = await getReceiptInfo(receiptPath);
    if (!info.exists) {
      throw badRequest('El comprobante no se terminó de subir. Volvé a intentarlo');
    }
    if (info.size > MAX_RECEIPT_BYTES) {
      await removeReceipt(receiptPath);
      throw badRequest('El comprobante no puede superar los 5 MB');
    }
    const mimeType = info.contentType || mimeTypeForPath(receiptPath);
    if (!ALLOWED_RECEIPT_TYPES.includes(mimeType)) {
      await removeReceipt(receiptPath);
      throw badRequest('Formato de comprobante no soportado');
    }
    receipt = {
      storagePath: receiptPath,
      fileName: (guest.receiptFileName || receiptPath.split('/').pop() || 'comprobante').slice(0, 200),
      mimeType,
      size: info.size,
    };
  }

  const lines = parseServiceLines(row.services);

  try {
    return await withTenant(companyId, async () => {
      const reservation = await createReservation(
        {
          roomId: row.room?.id ?? 0,
          rooms: bookingRooms(row).map(({ roomId, persons, extraBeds }) => ({ roomId, persons, extraBeds })),
          guest: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            phone: guest.phone,
            email: guest.email,
          },
          checkIn: toIsoDate(row.checkIn),
          checkOut: toIsoDate(row.checkOut),
          persons: row.persons,
          ...(row.discountType ? { discount: { type: row.discountType, value: decToNum(row.discountValue) } } : {}),
          extraBeds: row.extraBeds,
          services: lines.map((l) => ({
            serviceId: l.serviceId,
            quantity: l.quantity,
            ...(l.chargeType === 'PER_PERSON' && l.personsCovered != null
              ? { personsCovered: l.personsCovered }
              : {}),
          })),
          notes: guest.notes
            ? `Formulario de WhatsApp: ${guest.notes}`
            : 'Reserva enviada por el formulario de WhatsApp',
        },
        {
          forceStatus: 'PENDING',
          source: 'PUBLIC_LINK',
          skipPaymentLink: true,
          bookingLinkId: row.id,
          totalAmount: decToNum(row.total),
          depositRequired: deposit,
          rooms: bookingRooms(row),
          serviceLines: lines.map((line) => ({ serviceId: line.serviceId, name: line.name, description: line.description ?? null, chargeType: line.chargeType as ServiceChargeType, intervalDays: line.intervalDays ?? null, isExtraBed: line.isExtraBed, quantity: line.quantity, personsCovered: line.personsCovered, unitPrice: line.unitPrice })),
          roomPrice: decToNum(row.roomPrice ?? row.room?.price),
          roomPricingMode: row.roomPricingMode ?? row.room?.pricingMode ?? 'PER_NIGHT',
          ...(receipt
            ? { receipt: { ...receipt, externalRef: guest.externalRef ?? null } }
            : {}),
        },
      );
      return {
        code: reservation.code,
        total: reservation.totals.total,
        deposit,
        hotel: {
          name: row.company?.name ?? 'Hotel',
          whatsapp: row.company?.whatsapp ?? null,
          phone: row.company?.phone ?? null,
          slug: row.company?.bookingSlug ?? '',
        },
      };
    });
  } catch (err) {
    // La reserva no se creo: no dejamos el archivo huerfano en Storage.
    if (receiptPath) await removeReceipt(receiptPath);
    throw err;
  }
}

export async function getReservationReceipt(reservationId: number) {
  const receipt = await prisma.reservationReceipt.findUnique({ where: { reservationId } });
  if (!receipt) throw notFound('Comprobante', reservationId);
  const url = await createReceiptUrl(receipt.storagePath);
  return {
    url,
    fileName: receipt.fileName,
    mimeType: receipt.mimeType,
    size: receipt.size,
    externalRef: receipt.externalRef,
    createdAt: receipt.createdAt,
  };
}
