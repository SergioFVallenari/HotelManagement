import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { conflict, notFound } from '../../lib/AppError.js';
import { parseIdParam } from '../../lib/pagination.js';
import type { CreateServiceInput, UpdateServiceInput } from './services.schema.js';
import { createServiceSchema, updateServiceSchema } from './services.schema.js';

export async function listServices(_req: Request, res: Response): Promise<void> {
  const services = await prisma.service.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { reservations: true } } },
  });
  res.json({ data: services });
}

export async function createService(req: Request, res: Response): Promise<void> {
  const input = createServiceSchema.parse(req.body) as CreateServiceInput;
  const companyId = req.user!.companyId;
  const existing = await prisma.service.findUnique({
    where: { companyId_name: { companyId, name: input.name } },
  });
  if (existing) throw conflict('DUPLICATE', `El servicio "${input.name}" ya existe`);

  const service = await prisma.service.create({ data: { ...input, companyId } });
  res.status(201).json({ data: service });
}

export async function updateService(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const input = updateServiceSchema.parse(req.body) as UpdateServiceInput;

  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) throw notFound('Servicio', id);

  try {
    const updated = await prisma.service.update({ where: { id }, data: input });
    res.json({ data: updated });
  } catch {
    throw conflict('DUPLICATE', 'El nombre del servicio ya existe');
  }
}

export async function deleteService(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const service = await prisma.service.findUnique({ where: { id } });
  if (!service) throw notFound('Servicio', id);

  const used = await prisma.reservationService.count({ where: { serviceId: id } });
  if (used > 0) {
    throw conflict('SERVICE_IN_USE', 'No se puede eliminar un servicio usado en reservas');
  }
  try {
    await prisma.service.delete({ where: { id } });
    res.status(204).send();
  } catch {
    throw notFound('Servicio', id);
  }
}