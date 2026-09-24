import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { conflict, notFound } from '../../lib/AppError.js';
import { paginationMeta, parseIdParam, parsePagination } from '../../lib/pagination.js';
import type { CreateGuestInput, UpdateGuestInput } from './guests.schema.js';
import { createGuestSchema, updateGuestSchema } from './guests.schema.js';

export async function listGuests(req: Request, res: Response): Promise<void> {
  const { skip, take, page, pageSize } = parsePagination(req.query);
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;

  const where: Prisma.GuestWhereInput = q
    ? {
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
        ],
      }
    : {};

  const [total, guests] = await Promise.all([
    prisma.guest.count({ where }),
    prisma.guest.findMany({
      where,
      skip,
      take,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      include: { _count: { select: { reservations: true } } },
    }),
  ]);

  res.json({ data: guests, meta: paginationMeta(total, { page, pageSize, skip, take }) });
}

export async function getGuest(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      reservations: {
        orderBy: { checkIn: 'desc' },
        take: 20,
        include: {
          room: { select: { id: true, number: true, name: true } },
          services: { include: { service: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  if (!guest) throw notFound('Huésped', id);
  res.json({ data: guest });
}

export async function createGuest(req: Request, res: Response): Promise<void> {
  const input = createGuestSchema.parse(req.body) as CreateGuestInput;
  const companyId = req.user!.companyId;

  const existing = await prisma.guest.findUnique({
    where: { companyId_email: { companyId, email: input.email } },
  });
  if (existing) {
    throw conflict('GUEST_EXISTS', `Ya existe un huésped con el email ${input.email}`, existing);
  }

  const guest = await prisma.guest.create({ data: { ...input, companyId } });
  res.status(201).json({ data: guest });
}

export async function updateGuest(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = updateGuestSchema.parse(req.body) as UpdateGuestInput;

  const guest = await prisma.guest.findUnique({ where: { id } });
  if (!guest) throw notFound('Huésped', id);

  try {
    const updated = await prisma.guest.update({ where: { id }, data: input });
    res.json({ data: updated });
  } catch {
    throw conflict('DUPLICATE', 'El email ya está en uso por otro huésped');
  }
}