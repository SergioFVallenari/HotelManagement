import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { AppError, badRequest, conflict, forbidden } from '../../lib/AppError.js';
import { unscoped } from '../../lib/tenant.js';
import { adminCreateUser } from '../../lib/supabaseAuth.js';
import { buildInternalMetadata } from '../auth/auth.metadata.js';
import type { CreateUserInput } from './users.schema.js';
import { createUserSchema } from './users.schema.js';

const USER_SELECT = {
  username: true,
  isActive: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
  type: { select: { role: true } },
  company: { select: { name: true } },
} as const;

type UserRow = {
  username: string;
  isActive: boolean;
  createdAt: Date;
  user: { id: number; name: string | null; email: string };
  type: { role: 'OWNER' | 'ADMIN' | 'RECEPCIONISTA' };
  company: { name: string };
};

function toResponse({ username, isActive, createdAt, user, type, company }: UserRow) {
  return {
    id: user.id,
    username,
    name: user.name,
    email: user.email,
    isActive,
    createdAt,
    role: type.role,
    companyName: company.name,
  };
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const me = req.user!;
  if (me.role === 'RECEPCIONISTA') {
    throw forbidden('Se requiere rol de administrador o propietario');
  }

  // El OWNER ve a los usuarios (con creador) de su hotel actual; el ADMIN solo a los
  // recepcionistas de su hotel. En ambos casos el scope de tenant inyecta companyId.
  const rows: UserRow[] =
    me.role === 'OWNER'
      ? await prisma.userCompany.findMany({
          orderBy: { username: 'asc' },
          where: { companyId: me.companyId, createdById: { not: null } },
          select: USER_SELECT,
        })
      : await prisma.userCompany.findMany({
          orderBy: { username: 'asc' },
          where: { type: { role: 'RECEPCIONISTA' } },
          select: USER_SELECT,
        });

  res.json({ data: rows.map(toResponse) });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const input = createUserSchema.parse(req.body) as CreateUserInput;
  const me = req.user!;

  let companyId: number;
  if (me.role === 'OWNER') {
    if (!input.companyId) throw badRequest('Elegí el hotel');
    const company = await prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company || company.createdById !== me.id) {
      throw forbidden('Solo podés crear usuarios en tus hoteles');
    }
    companyId = input.companyId;
  } else {
    companyId = me.companyId;
  }

  const existingByUsername = await unscoped(() =>
    prisma.userCompany.findUnique({
      where: { companyId_username: { companyId, username: input.username } },
    }),
  );
  if (existingByUsername) {
    throw conflict('DUPLICATE', `El usuario "${input.username}" ya existe`);
  }

  const type = await prisma.userType.upsert({
    where: { role: input.role },
    update: {},
    create: { role: input.role },
  });

  const existingUser = await unscoped(() =>
    prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    }),
  );

  try {
    let userId: number;

    if (existingUser) {
      const alreadyMember = await unscoped(() =>
        prisma.userCompany.findUnique({
          where: { userId_companyId: { userId: existingUser.id, companyId } },
          select: { userId: true },
        }),
      );
      if (alreadyMember) {
        throw conflict('DUPLICATE', 'Ya existe un usuario con ese email en este hotel');
      }

      await prisma.userCompany.create({
        data: {
          userId: existingUser.id,
          companyId,
          username: input.username,
          typeId: type.id,
          isActive: input.isActive,
          createdById: me.id,
        },
      });
      userId = existingUser.id;
    } else {
      const authUserId = await adminCreateUser({
        email: input.email,
        password: input.password,
        metadata: buildInternalMetadata({
          username: input.username,
          name: input.name,
          role: input.role,
          companyId,
          createdById: me.id,
          isActive: input.isActive,
        }),
      });

      const created = await unscoped(() =>
        prisma.user.findUnique({ where: { authUserId }, select: { id: true } }),
      );
      if (!created) {
        throw new AppError(500, 'AUTH_ERROR', 'No se pudo crear el usuario');
      }
      userId = created.id;
    }

    const row = (await unscoped(() =>
      prisma.userCompany.findUnique({
        where: { userId_companyId: { userId, companyId } },
        select: USER_SELECT,
      }),
    )) as UserRow | null;
    if (!row) {
      throw new AppError(500, 'AUTH_ERROR', 'No se pudo crear el usuario');
    }

    res.status(201).json({ data: toResponse(row) });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'P2002') {
      throw conflict('DUPLICATE', `El usuario "${input.username}" ya existe`);
    }
    throw err;
  }
}
