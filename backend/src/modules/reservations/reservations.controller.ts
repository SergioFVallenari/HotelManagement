import type { Request, Response } from 'express';
import { Prisma, ReservationStatus } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { paginationMeta, parseIdParam, parsePagination } from '../../lib/pagination.js';
import { parseDate } from '../../lib/date.js';
import {
  changeStatus,
  createReservation,
  getReservation,
  markRefunded,
  serializeReservation,
  updateReservation,
} from './reservations.service.js';
import type { CreateReservationInput, UpdateReservationInput } from './reservations.schema.js';
import { createReservationSchema, updateReservationSchema } from './reservations.schema.js';

const listInclude = {
  room: { select: { id: true, number: true, name: true, capacity: true, price: true } },
  guest: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
  services: { include: { service: { select: { id: true, name: true, chargeType: true, isExtraBed: true } } } },
  payments: true,
} as const;

export async function listReservations(req: Request, res: Response): Promise<void> {
  const { skip, take, page, pageSize } = parsePagination(req.query);
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const guestId = req.query.guestId ? Number(req.query.guestId) : undefined;
  const roomId = req.query.roomId ? Number(req.query.roomId) : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  const from = req.query.from !== undefined ? parseDate(req.query.from, 'from') : undefined;
  const to = req.query.to !== undefined ? parseDate(req.query.to, 'to') : undefined;
  if (from && to && to <= from) throw badRequest('"to" debe ser posterior a "from"');

  const where: Prisma.ReservationWhereInput = {
    ...(status === 'active'
      ? { status: { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] } }
      : status !== undefined
        ? { status: status as ReservationStatus }
        : {}),
    ...(guestId && Number.isInteger(guestId) ? { guestId } : {}),
    ...(roomId && Number.isInteger(roomId) ? { roomId } : {}),
    ...(from && to
      ? { AND: [{ checkIn: { lt: to } }, { checkOut: { gt: from } }] }
      : from
        ? { checkOut: { gt: from } }
        : to
          ? { checkIn: { lt: to } }
          : {}),
    ...(search
      ? {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { guest: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
            { room: { number: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };

  const [total, reservations] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      skip,
      take,
      include: listInclude,
      orderBy: [{ createdAt: 'desc' }],
    }),
  ]);

  const data = reservations.map((r) => serializeReservation(r));
  res.json({ data, meta: paginationMeta(total, { page, pageSize, skip, take }) });
}

export async function createReservationHandler(req: Request, res: Response): Promise<void> {
  const input = createReservationSchema.parse(req.body) as CreateReservationInput;
  const reservation = await createReservation(input);
  res.status(201).json({ data: reservation });
}

export async function getReservationHandler(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const reservation = await getReservation(id);
  res.json({ data: reservation });
}

export async function updateReservationHandler(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = updateReservationSchema.parse(req.body) as UpdateReservationInput;
  const reservation = await updateReservation(id, input);
  res.json({ data: reservation });
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const reservation = await changeStatus(id, 'CHECKED_IN');
  res.json({ data: reservation });
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const reservation = await changeStatus(id, 'CHECKED_OUT');
  res.json({ data: reservation });
}

export async function cancelReservation(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const reservation = await changeStatus(id, 'CANCELLED');
  res.json({ data: reservation });
}

export async function markRefundedHandler(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const reservation = await markRefunded(id);
  res.json({ data: reservation });
}