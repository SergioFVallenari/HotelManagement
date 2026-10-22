import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { conflict, forbidden, notFound, unauthorized } from '../../lib/AppError.js';
import { unscoped } from '../../lib/tenant.js';
import { confirmEmail, resendConfirmation, resolveAuthUserId, signInWithPassword, signUpSelfService } from '../../lib/supabaseAuth.js';
import { AUTH_COOKIE, authCookieOptions } from '../../lib/cookie.js';
import { buildSelfServiceMetadata } from './auth.metadata.js';
import type { CredentialsInput, LoginInput, RegisterInput, ResendInput, SwitchCompanyInput } from './auth.schema.js';
import { credentialsSchema, loginSchema, registerSchema, resendSchema, switchCompanySchema } from './auth.schema.js';

// El link de confirmacion de Supabase redirige a la Site URL del dashboard; si
// la request trae Origin, ese es el frontend que se esta registrando, asi el
// usuario no aterriza en la API ni en el entorno equivocado. GoTrue solo acepta
// hosts de la allowlist de Redirect URLs y, si no lo esta, usa la Site URL.
function appOrigin(req: Request): string | undefined {
  const origin = req.get('origin');
  return origin && /^https?:\/\/[^/]+$/i.test(origin) ? origin : undefined;
}

export async function loginForCompanies(req: Request, res: Response): Promise<void> {
  const input = credentialsSchema.parse(req.body) as CredentialsInput;
  const { authUserId, accessToken } = await signInWithPassword(input.email, input.password);

  const user = await unscoped(() =>
    prisma.user.findUnique({
      where: { authUserId },
      include: {
        companies: {
          where: { isActive: true },
          include: {
            company: { select: { id: true, name: true } },
            type: { select: { role: true } },
          },
        },
      },
    }),
  );

  if (!user || user.companies.length === 0) throw unauthorized();

  const isOwner = user.companies.some((membership) => membership.type.role === 'OWNER');

  let companies: { id: number; name: string; role: string }[];

  if (isOwner) {
    const ownedCompanies = await unscoped(() =>
      prisma.company.findMany({
        where: { createdById: user.id },
        select: { id: true, name: true },
      }),
    );

    companies = ownedCompanies.map((company) => ({
      id: company.id,
      name: company.name,
      role: 'OWNER',
    }));
  } else {
    companies = user.companies.map((membership) => ({
      id: membership.company.id,
      name: membership.company.name,
      role: membership.type.role,
    }));
  }

  res.json({ companies, token: accessToken });
}

export async function login(req: Request, res: Response): Promise<void> {
  const input = loginSchema.parse(req.body) as LoginInput;
  const authUserId = await resolveAuthUserId(input.token);

  const user = await unscoped(() => prisma.user.findUnique({ where: { authUserId } }));
  const membership = user
    ? await unscoped(() =>
        prisma.userCompany.findUnique({
          where: { userId_companyId: { userId: user.id, companyId: input.companyId } },
          include: { type: true, company: { select: { createdById: true, name: true } } },
        }),
      )
    : null;

  if (!user || !membership || !membership.isActive) throw unauthorized();

  // Misma regla que el picker: el OWNER solo entra a las empresas que posee.
  if (membership.type.role === 'OWNER' && membership.company.createdById !== user.id) {
    throw unauthorized();
  }

  const payload = {
    id: user.id,
    username: membership.username,
    role: membership.type.role,
    name: user.name,
    email: user.email,
    companyId: membership.companyId,
    companyName: membership.company.name
  };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.json({ user: payload });
}

export async function register(req: Request, res: Response): Promise<void> {
  const input = registerSchema.parse(req.body) as RegisterInput;

  const existing = await prisma.company.findUnique({ where: { name: input.hotelName } });
  if (existing) {
    throw conflict('DUPLICATE', `Ya existe un hotel llamado "${input.hotelName}". Elegí otro nombre.`);
  }
  await signUpSelfService({
    email: input.email,
    password: input.password,
    metadata: buildSelfServiceMetadata({
      username: input.username,
      name: input.name,
      hotelName: input.hotelName,
    }),
    emailRedirectTo: appOrigin(req),
  });

  res.status(201).json({ data: { sent: true } });
}

export async function resend(req: Request, res: Response): Promise<void> {
  const input = resendSchema.parse(req.body) as ResendInput;
  await resendConfirmation(input.email, appOrigin(req));
  res.json({ data: { sent: true } });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(AUTH_COOKIE, authCookieOptions());
  res.json({ ok: true });
}

export async function switchCompany(req: Request, res: Response): Promise<void> {
  const input = switchCompanySchema.parse(req.body) as SwitchCompanyInput;

  if (req.user!.role !== 'OWNER') {
    throw forbidden('Solo podés cambiar a hoteles donde seas propietario');
  }

  const company = await unscoped(() => prisma.company.findUnique({ where: { id: input.companyId } }));
  if (!company || company.createdById !== req.user!.id) {
    throw notFound('El hotel', input.companyId);
  }

  const membership = await unscoped(() =>
    prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: req.user!.id, companyId: input.companyId } },
      select: { username: true },
    }),
  );

  const payload = {
    id: req.user!.id,
    username: membership?.username ?? req.user!.username,
    role: 'OWNER',
    name: req.user!.name,
    email: req.user!.email,
    companyId: input.companyId,
    companyName: company.name
  };
  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });

  res.cookie(AUTH_COOKIE, token, authCookieOptions());
  res.json({ user: payload });
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}
export async function confirmationEmail(req: Request, res: Response) {
  const { token_hash, type } = req.query;

  if (typeof token_hash !== 'string' || type !== 'email') {
    res.status(400).json({
      message: 'El enlace es inválido o está incompleto.',
    });
    return;
  }

  try {
    await confirmEmail(token_hash);

    res.set('Cache-Control', 'no-store');
    res.json({ message: 'Email confirmado correctamente.' });
  } catch {
    res.status(400).json({
      message: 'El enlace expiró o ya fue utilizado.',
    });
  }
}
