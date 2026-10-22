import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { unscoped } from '../../lib/tenant.js';
import { AppError, conflict } from '../../lib/AppError.js';
import type { CreateCompanyInput } from './companies.schema.js';
import { createCompanySchema } from './companies.schema.js';

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