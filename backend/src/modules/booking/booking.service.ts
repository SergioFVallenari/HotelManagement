import { randomUUID } from 'node:crypto';
import { Prisma, type BookingLinkStatus } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import { decToNum, round2 } from '../../lib/money.js';
import { assertValidRange, nightsBetween, parseDate } from '../../lib/date.js';
import { computeBookingDeposit, quoteStay } from '../../lib/pricing.js';
import { getTenantId, withTenant } from '../../lib/tenant.js';
import { createReservation, loadServices } from '../reservations/reservations.service.js';
import type {
  CreateBookingLinkInput,
  ListBookingLinksQuery,
  PublicBookingInput,
  ReceiptUploadInput,
} from './booking.schema.js';
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

interface BookingLinkRow {
  id: number;
  token: string;
  status: string;
  checkIn: Date;
  checkOut: Date;
  persons: number;
  extraBeds: number;
  services: unknown;
  total: unknown;
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
    type?: { id: number; name: string } | null;
  } | null;
  reservation?: { id: number; code: string; status: string } | null;
  company?: { id: number; name: string; whatsapp: string | null; phone: string | null } | null;
}

const LINK_INCLUDE = {
  room: { include: { type: true } },
  reservation: { select: { id: true, code: true, status: true } },
  company: { select: { id: true, name: true, whatsapp: true, phone: true } },
} as const;

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
        roomLabel: roomLabel(row.room),
        checkIn: toIsoDate(row.checkIn),
        checkOut: toIsoDate(row.checkOut),
        nights,
        total,
        deposit,
        url,
      })
    : '';

  return {
    id: row.id,
    token: row.token,
    url,
    status: row.status,
    checkIn: toIsoDate(row.checkIn),
    checkOut: toIsoDate(row.checkOut),
    nights,
    persons: row.persons,
    extraBeds: row.extraBeds,
    room: row.room
      ? {
          id: row.room.id,
          number: row.room.number,
          typeName: row.room.type?.name ?? null,
          capacity: row.room.capacity,
          price: decToNum(row.room.price),
          label: roomLabel(row.room),
        }
      : null,
    services: lines,
    totals: {
      roomTotal: round2(total - servicesTotal),
      servicesTotal,
      total,
      deposit,
      balance: round2(total - deposit),
    },
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
    hotel: {
      name: row.company?.name ?? 'Hotel',
      whatsapp: row.company?.whatsapp ?? null,
      phone: row.company?.phone ?? null,
    },
    stay: {
      checkIn: toIsoDate(row.checkIn),
      checkOut: toIsoDate(row.checkOut),
      nights,
      persons: row.persons,
      extraBeds: row.extraBeds,
      roomType: row.room?.type?.name ?? 'Habitación',
      roomCapacity: row.room?.capacity ?? null,
    },
    services: lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
    })),
    totals: {
      roomTotal: round2(total - servicesTotal),
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

  const room = await prisma.room.findFirst({ where: { id: input.roomId, isActive: true, companyId } });
  if (!room) throw notFound('Habitación', input.roomId);

  const persons = input.persons;
  const extraBeds = input.extraBeds;
  if (persons > room.capacity) {
    throw badRequest(`La habitación admite hasta ${room.capacity} personas`);
  }
  if (extraBeds > room.maxExtraBeds) {
    throw badRequest(`La habitación admite hasta ${room.maxExtraBeds} cama(s) extra(s)`);
  }
  if (extraBeds > 0 && persons < room.capacity) {
    throw badRequest('Las camas extras solo pueden cargarse cuando la habitación está llena (personas = capacidad)');
  }

  const overlap = await prisma.reservation.findFirst({
    where: {
      companyId,
      roomId: room.id,
      status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] },
      AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
    },
    select: { code: true },
  });
  if (overlap) {
    throw conflict('ROOM_OCCUPIED', `La habitación ya está ocupada en ese período (reserva ${overlap.code})`);
  }

  const nights = nightsBetween(checkIn, checkOut);
  const services = await loadServices(input.services, { persons, extraBeds, nights });
  const lines: BookingServiceLine[] = services.map((s) => ({
    serviceId: s.id,
    name: s.name,
    chargeType: s.chargeType,
    quantity: s.quantity,
    personsCovered: s.personsCovered,
    unitPrice: decToNum(s.price),
    lineTotal: round2(s.quantity * decToNum(s.price)),
  }));

  const { total } = quoteStay(
    nights,
    decToNum(room.price),
    lines.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice })),
  );

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { bookingDepositPercent: true },
  });
  const percent = company?.bookingDepositPercent ?? DEFAULT_DEPOSIT_PERCENT;
  const deposit =
    input.deposit != null
      ? round2(Math.min(round2(input.deposit), total))
      : computeBookingDeposit(total, percent);
  if (deposit <= 0) {
    throw badRequest(
      'El anticipo no puede ser 0: configurá el porcentaje de anticipo en Ajustes o indicá un monto para esta solicitud',
    );
  }

  const ttlDays = input.expiresInDays ?? BOOKING_LINK_TTL_DAYS;
  const link = await prisma.bookingLink.create({
    data: {
      token: generateBookingToken(),
      companyId,
      roomId: room.id,
      checkIn,
      checkOut,
      persons,
      extraBeds,
      services: lines as unknown as Prisma.InputJsonValue,
      total,
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
          guest: {
            firstName: guest.firstName,
            lastName: guest.lastName,
            phone: guest.phone,
            email: guest.email,
          },
          checkIn: toIsoDate(row.checkIn),
          checkOut: toIsoDate(row.checkOut),
          persons: row.persons,
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
