import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client.js';
import { prisma } from '../../config/prisma.js';
import { unscoped } from '../../lib/tenant.js';
import { AppError, badRequest, conflict } from '../../lib/AppError.js';
import { getBookingCapacity } from '../booking/booking.capacity.js';

const SETTINGS_SELECT = {
  id: true,
  name: true,
  whatsapp: true,
  phone: true,
  bookingDepositPercent: true,
  bookingSlug: true,
  configPage: true,
} as const;

export async function getCurrentCompany(req: Request, res: Response): Promise<void> {
  const company = await prisma.company.findUnique({
    where: { id: req.user!.companyId },
    select: SETTINGS_SELECT,
  });
  if (!company) throw new AppError(404, 'NOT_FOUND', 'El hotel no existe');
  res.json({ data: { ...company, ...await getBookingCapacity(company.id, company.configPage) } });
}

export async function updateCompanySettings(req: Request, res: Response): Promise<void> {
  const input = updateCompanySettingsSchema.parse(req.body) as UpdateCompanySettingsInput;
  if (input.configPage?.publicExtraBeds?.enabled) {
    const service = await prisma.service.findFirst({ where: { id: input.configPage.publicExtraBeds.serviceId!, companyId: req.user!.companyId, isActive: true, isExtraBed: true }, select: { id: true } });
    if (!service) throw badRequest('Elegí un servicio de cama extra activo de este alojamiento');
  }
  if (input.configPage?.maxAvailabilityPersons != null) {
    const capacity = await getBookingCapacity(req.user!.companyId, input.configPage);
    const limit = capacity.publicExtraBedsEnabled ? capacity.hotelCapacityWithExtraBeds : capacity.hotelCapacity;
    if (input.configPage.maxAvailabilityPersons > limit) {
      throw badRequest(`El máximo de personas no puede superar la capacidad del hotel (${limit}).`);
    }
  }
  const company = await prisma.company.update({
    where: { id: req.user!.companyId },
    data: {
      ...(input.whatsapp !== undefined ? { whatsapp: input.whatsapp?.trim() || null } : {}),
      ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
      ...(input.bookingDepositPercent !== undefined
        ? { bookingDepositPercent: input.bookingDepositPercent }
        : {}),
      ...(input.bookingSlug !== undefined ? { bookingSlug: input.bookingSlug?.trim() || null } : {}),
      ...(input.configPage !== undefined ? { configPage: input.configPage as Prisma.InputJsonValue } : {}),
    },
    select: SETTINGS_SELECT,
  });
  res.json({ data: { ...company, ...await getBookingCapacity(company.id, company.configPage) } });
}
import type { CreateCompanyInput, UpdateCompanySettingsInput } from './companies.schema.js';
import { createCompanySchema, updateCompanySettingsSchema } from './companies.schema.js';

export async function listCompanies(_req: Request, res: Response): Promise<void> {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  res.json({ data: companies });
}

export async function listOwnedCompanies(req: Request, res: Response): Promise<void> {
  const companies = await prisma.company.findMany({
    where: { createdById: req.user!.id },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  res.json({ data: companies });
}

export async function createCompany(req: Request, res: Response): Promise<void> {
  const input = createCompanySchema.parse(req.body) as CreateCompanyInput;

  const existing = await prisma.company.findUnique({ where: { name: input.name } });
  if (existing) throw conflict('DUPLICATE', `El hotel "${input.name}" ya existe`);

  const owner = await unscoped(() => prisma.user.findUnique({ where: { id: req.user!.id } }));
  if (!owner) throw new AppError(404, 'NOT_FOUND', 'El usuario propietario no existe');

  try {
    const company = await prisma.$transaction(async (tx) => {
      const ownerType = await tx.userType.upsert({
        where: { role: 'OWNER' },
        update: {},
        create: { role: 'OWNER' },
      });
      const created = await tx.company.create({
        data: {
          name: input.name,
          createdById: owner.id,
        },
        select: { id: true, name: true },
      });

      // El dueño queda como miembro OWNER del hotel nuevo para poder ingresar con
      // el switch de empresa. createdById null para que no aparezca en su propia lista.
      await tx.userCompany.create({
        data: {
          userId: owner.id,
          companyId: created.id,
          username: req.user!.username,
          typeId: ownerType.id,
          isActive: true,
          createdById: null,
        },
      });

      return created;
    });
    res.status(201).json({ data: company });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('DUPLICATE', `El hotel "${input.name}" ya existe`);
    }
    throw err;
  }
}
