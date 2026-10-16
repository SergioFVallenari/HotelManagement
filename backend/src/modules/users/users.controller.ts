import type { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError, badRequest, conflict, forbidden } from '../../lib/AppError.js';
import { unscoped } from '../../lib/tenant.js';
import { isMailConfigured, sendMail } from '../../lib/mailer.js';
import { generateCode, hashCode, isCodeMatch } from './users.code.js';
import type { RegisterInput, SendCodeInput, CreateUserInput } from './users.schema.js';
import { registerSchema, sendCodeSchema, createUserSchema } from './users.schema.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS = 3;
const SEND_WINDOW_MS = 60 * 60 * 1000;

const sends = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string): void {
  const now = Date.now();
  const entry = sends.get(key);
  if (!entry || entry.resetAt < now) {
    sends.set(key, { count: 1, resetAt: now + SEND_WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_SENDS) {
    throw new AppError(429, 'RATE_LIMIT', 'Demasiados intentos. Esperá una hora y volvé a intentar.');
  }
}

export async function sendVerificationCode(req: Request, res: Response): Promise<void> {
  const input = sendCodeSchema.parse(req.body) as SendCodeInput;
  checkRateLimit(`email:${input.email}`);
  checkRateLimit(`ip:${req.ip ?? 'unknown'}`);

  const code = generateCode();
  await prisma.emailVerificationCode.deleteMany({ where: { email: input.email, consumedAt: null } });
  await prisma.emailVerificationCode.create({
    data: {
      email: input.email,
      codeHash: hashCode(code, env.jwtSecret),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });

  const subject = 'Tu código de verificación - Hotel Manager';
  const text = `Tu código de verificación es: ${code}\nVálido por 10 minutos. Si no pediste este código, ignorá este mensaje.`;

  if (!isMailConfigured()) {
    if (env.isProduction) {
      throw new AppError(500, 'MAIL_NOT_CONFIGURED', 'El servicio de email no está configurado');
    }
    console.log(`[users] Código de verificación para ${input.email}: ${code}`);
  } else {
    try {
      await sendMail({ to: input.email, subject, text });
    } catch (err) {
      console.error('[users] Error enviando email de verificación:', err);
      throw new AppError(500, 'MAIL_ERROR', 'No se pudo enviar el email de verificación');
    }
  }

  res.json({ data: { sent: true } });
}

export async function registerUser(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body) as RegisterInput;

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email: input.email, consumedAt: null },
    orderBy: { id: 'desc' },
  });
  const valid =
    !!record &&
    record.expiresAt.getTime() > Date.now() &&
    record.attempts < MAX_ATTEMPTS &&
    isCodeMatch(input.code, record.codeHash, env.jwtSecret);

  if (!record) throw new AppError(400, 'INVALID_CODE', 'Código inválido o expirado. Pedí uno nuevo.');
  if (!valid) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    throw new AppError(400, 'INVALID_CODE', 'Código inválido o expirado. Pedí uno nuevo.');
  }

  let created;
  try {
    created = await prisma.$transaction(async (tx) => {
      const ownerType = await tx.userType.upsert({
        where: { role: 'OWNER' },
        update: {},
        create: { role: 'OWNER' },
      });
      const company = await tx.company.create({ data: { name: input.hotelName } });
      const user = await tx.user.create({
        data: {
          username: input.username,
          passwordHash: bcrypt.hashSync(input.password, 10),
          name: input.name,
          email: input.email,
          typeId: ownerType.id,
          companyId: company.id,
        },
        select: { id: true, username: true, name: true, email: true, isActive: true },
      });
      await tx.company.update({ where: { id: company.id }, data: { createdById: user.id } });
      return user;
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('DUPLICATE', `Ya existe un hotel llamado "${input.hotelName}". Elegí otro nombre.`);
    }
    throw err;
  }

  await prisma.emailVerificationCode.deleteMany({ where: { email: input.email, consumedAt: null } });
  res.status(201).json({ data: created });
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const me = req.user!;
  if (me.role === 'RECEPCIONISTA') {
    throw forbidden('Se requiere rol de administrador o propietario');
  }

  const base = {
    orderBy: { username: 'asc' as const },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      isActive: true,
      createdAt: true,
      type: { select: { role: true } },
      company: { select: { name: true } },
    },
  };

  // El OWNER ve solo a los usuarios que él dio de alta (cross-tenant), el
  // ADMIN solo a los recepcionistas de su hotel (scopeado por el tenant).
  const users =
    me.role === 'OWNER'
      ? await unscoped(() =>
          prisma.user.findMany({ ...base, where: { createdById: me.id } }),
        )
      : await prisma.user.findMany({ ...base, where: { type: { role: 'RECEPCIONISTA' } } });

  res.json({
    data: users.map(({ type, company, ...user }) => ({
      ...user,
      role: type.role,
      companyName: company.name,
    })),
  });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const input = createUserSchema.parse(req.body) as CreateUserInput;
  const me = req.user!;

  if (me.role === 'ADMIN' && input.role !== 'RECEPCIONISTA') {
    throw forbidden('Un administrador solo puede crear usuarios de recepción');
  }

  let companyId: number;
  if (me.role === 'OWNER') {
    if (!input.companyId) throw badRequest('Elegí el hotel del usuario');
    const owned = await prisma.company.findFirst({
      where: { id: input.companyId, createdById: me.id },
    });
    if (!owned) throw forbidden('Solo podés crear usuarios en hoteles que vos creaste');
    companyId = input.companyId;
  } else {
    companyId = me.companyId;
  }

  const existing = await prisma.user.findUnique({
    where: { companyId_username: { companyId, username: input.username } },
  });
  if (existing) throw conflict('DUPLICATE', `El usuario "${input.username}" ya existe`);

  const type = await prisma.userType.upsert({
    where: { role: input.role },
    update: {},
    create: { role: input.role },
  });

  try {
    const user = await prisma.user.create({
      data: {
        username: input.username,
        passwordHash: bcrypt.hashSync(input.password, 10),
        name: input.name,
        email: input.email,
        isActive: input.isActive,
        typeId: type.id,
        companyId,
        createdById: me.id,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        isActive: true,
        type: { select: { role: true } },
        company: { select: { name: true } },
      },
    });
    const { type: userType, company, ...rest } = user;
    res.status(201).json({
      data: { ...rest, role: userType.role, companyName: company.name },
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      throw conflict('DUPLICATE', `El usuario "${input.username}" ya existe`);
    }
    throw err;
  }
}
