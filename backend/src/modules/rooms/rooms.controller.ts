import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { badRequest, conflict, notFound } from '../../lib/AppError.js';
import type { Pagination } from '../../lib/pagination.js';
import { paginationMeta, parseIdParam, parsePagination, parseBool } from '../../lib/pagination.js';
import { parseDate } from '../../lib/date.js';
import type { CreateRoomInput, UpdateRoomInput } from './rooms.schema.js';
import { createRoomSchema, updateRoomSchema } from './rooms.schema.js';

const reservationInclude = {
  guest: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} as const;

export async function listRooms(req: Request, res: Response): Promise<void> {
  const { skip, take, page, pageSize } = parsePagination(req.query);
  const isActive = parseBool(req.query.isActive);
  const typeId = req.query.typeId ? Number(req.query.typeId) : undefined;
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

  const where: Prisma.RoomWhereInput = {
    ...(isActive !== undefined ? { isActive } : {}),
    ...(typeId && Number.isInteger(typeId) ? { typeId } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: 'insensitive' } },
            { name: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rooms] = await Promise.all([
    prisma.room.count({ where }),
    prisma.room.findMany({
      where,
      skip,
      take,
      include: { type: true, _count: { select: { reservations: { where: { status: { not: 'CANCELLED' } } } } } },
      orderBy: [{ isActive: 'desc' }, { number: 'asc' }],
    }),
  ]);

  res.json({ data: rooms, meta: paginationMeta(total, { page, pageSize, skip, take } as Pagination) });
}

export async function getRoom(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const room = await prisma.room.findUnique({
    where: { id },
    include: {
      type: true,
      reservations: {
        orderBy: { checkIn: 'desc' },
        take: 20,
        include: reservationInclude,
      },
    },
  });
  if (!room) throw notFound('Habitación', id);
  res.json({ data: room });
}

export async function availableRooms(req: Request, res: Response): Promise<void> {
  const checkIn = parseDate(req.query.checkIn, 'checkIn');
  const checkOut = parseDate(req.query.checkOut, 'checkOut');
  if (checkOut <= checkIn) throw badRequest('checkOut debe ser posterior a checkIn');

  const typeId = req.query.typeId ? Number(req.query.typeId) : undefined;

  const conflicts = await prisma.reservation.findMany({
    where: {
      status: { in: ['RESERVED', 'CHECKED_IN'] },
      AND: [{ checkIn: { lt: checkOut } }, { checkOut: { gt: checkIn } }],
    },
    select: { roomId: true },
    distinct: ['roomId'],
  });
  const takenIds = conflicts.map((c) => c.roomId);

  const rooms = await prisma.room.findMany({
    where: {
      isActive: true,
      ...(typeId && Number.isInteger(typeId) ? { typeId } : {}),
      ...(takenIds.length > 0 ? { NOT: { id: { in: takenIds } } } : {}),
    },
    include: { type: true },
    orderBy: [{ typeId: 'asc' }, { number: 'asc' }],
  });

  res.json({
    data: rooms,
    meta: { checkIn: checkIn.toISOString().slice(0, 10), checkOut: checkOut.toISOString().slice(0, 10), total: rooms.length },
  });
}

export async function createRoom(req: Request, res: Response): Promise<void> {
  const input = createRoomSchema.parse(req.body) as CreateRoomInput;
  const companyId = req.user!.companyId;

  const type = await prisma.roomType.findUnique({ where: { id: input.typeId } });
  if (!type) throw notFound('Tipo de habitación', input.typeId);

  const existing = await prisma.room.findUnique({
    where: { companyId_number: { companyId, number: input.number } },
  });
  if (existing) throw conflict('DUPLICATE', `La habitación "${input.number}" ya existe`);

  const room = await prisma.room.create({ data: { ...input, companyId }, include: { type: true } });
  res.status(201).json({ data: room });
}

export async function updateRoom(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = updateRoomSchema.parse(req.body) as UpdateRoomInput;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) throw notFound('Habitación', id);

  if (input.typeId !== undefined) {
    const type = await prisma.roomType.findUnique({ where: { id: input.typeId } });
    if (!type) throw notFound('Tipo de habitación', input.typeId);
  }

  try {
    const updated = await prisma.room.update({
      where: { id },
      data: input,
      include: { type: true },
    });
    res.json({ data: updated });
  } catch {
    throw conflict('DUPLICATE', 'El número de habitación ya está en uso');
  }
}

export async function deleteRoom(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);

  const active = await prisma.reservation.count({
    where: { roomId: id, status: { in: ['RESERVED', 'CHECKED_IN'] } },
  });
  if (active > 0) {
    throw conflict('ROOM_HAS_RESERVATIONS', 'No se puede eliminar una habitación con reservas activas');
  }

  try {
    await prisma.room.delete({ where: { id } });
    res.status(204).send();
  } catch {
    throw notFound('Habitación', id);
  }
}