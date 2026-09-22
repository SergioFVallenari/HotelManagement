import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { notFound, conflict, badRequest } from '../../lib/AppError.js';
import { parseIdParam } from '../../lib/pagination.js';
import type { CreateRoomTypeInput, UpdateRoomTypeInput } from './roomTypes.schema.js';
import { createRoomTypeSchema, updateRoomTypeSchema } from './roomTypes.schema.js';

export async function listRoomTypes(_req: Request, res: Response): Promise<void> {
  const roomTypes = await prisma.roomType.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { rooms: true } } },
  });
  res.json({ data: roomTypes });
}

export async function getRoomType(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const roomType = await prisma.roomType.findUnique({
    where: { id },
    include: { _count: { select: { rooms: true } } },
  });
  if (!roomType) throw notFound('Tipo de habitación', id);
  res.json({ data: roomType });
}

export async function createRoomType(req: Request, res: Response): Promise<void> {
  const input = createRoomTypeSchema.parse(req.body) as CreateRoomTypeInput;
  const roomType = await prisma.roomType.create({ data: input });
  res.status(201).json({ data: roomType });
}

export async function updateRoomType(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = updateRoomTypeSchema.parse(req.body) as UpdateRoomTypeInput;
  const exists = await prisma.roomType.findUnique({ where: { id } });
  if (!exists) throw notFound('Tipo de habitación', id);

  try {
    const roomType = await prisma.roomType.update({ where: { id }, data: input });
    res.json({ data: roomType });
  } catch {
    throw conflict('DUPLICATE', 'El nombre del tipo ya existe');
  }
}

export async function deleteRoomType(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const rooms = await prisma.room.count({ where: { typeId: id } });
  if (rooms > 0) {
    throw conflict('TYPE_IN_USE', 'No se puede eliminar un tipo que tiene habitaciones asignadas');
  }
  try {
    await prisma.roomType.delete({ where: { id } });
    res.status(204).send();
  } catch {
    throw notFound('Tipo de habitación', id);
  }
}