import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';

export async function listCompanies(_req: Request, res: Response): Promise<void> {
  const companies = await prisma.company.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });
  res.json({ data: companies });
}