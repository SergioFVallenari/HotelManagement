import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { unauthorized } from '../../lib/AppError.js';
import { unscoped } from '../../lib/tenant.js';
import { signMobileToken } from './mobile.token.js';
import { createRefreshToken, hashRefreshToken, MOBILE_ACCESS_TTL, MOBILE_REFRESH_TTL_MS, refreshState } from './mobile.refresh.js';
import type { z } from 'zod';
import type { mobileSessionSchema } from './mobile.schema.js';

function sessionResponse(user: z.infer<typeof mobileSessionSchema>, refreshToken: string, expiresAt: Date) {
  const access = signMobileToken(user, env.jwtSecret, MOBILE_ACCESS_TTL);
  return { ...access, accessToken: access.token, refreshToken, refreshExpiresAt: expiresAt.toISOString(), user };
}

export async function createMobileSession(user: z.infer<typeof mobileSessionSchema>) {
  const token = createRefreshToken();
  const expiresAt = new Date(Date.now() + MOBILE_REFRESH_TTL_MS);
  await prisma.mobileSession.create({
    data: {
      userId: user.id, companyId: user.companyId, expiresAt,
      tokens: { create: { hash: token.hash } },
    },
  });
  return sessionResponse(user, token.refreshToken, expiresAt);
}

export async function rotateMobileSession(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  const result = await unscoped(() => prisma.$transaction(async (tx) => {
    const initial = await tx.mobileRefreshToken.findUnique({ where: { hash } });
    if (!initial) return null;

    // La familia se bloquea también al cerrar sesión: ni rotaciones ni replays pueden revivirla.
    await tx.$queryRaw`SELECT "id" FROM "MobileSession" WHERE "id" = ${initial.sessionId} FOR UPDATE`;
    const token = await tx.mobileRefreshToken.findUnique({
      where: { hash },
      include: { session: { include: { membership: { include: {
        user: true, type: true, company: { select: { createdById: true, name: true } },
      } } } } },
    });
    if (!token) return null;
    const now = new Date();
    const state = refreshState(token.session, token.consumedAt, now);
    if (state === 'invalid') return null;
    const membership = token.session.membership;
    if (state === 'reused' || !membership.isActive
      || (membership.type.role === 'OWNER' && membership.company.createdById !== membership.userId)) {
      await tx.mobileSession.update({ where: { id: token.sessionId }, data: { revokedAt: now } });
      return null;
    }

    const next = createRefreshToken();
    await tx.mobileRefreshToken.update({ where: { hash }, data: { consumedAt: now } });
    await tx.mobileRefreshToken.create({ data: { hash: next.hash, sessionId: token.sessionId } });
    const user = {
      id: membership.userId, username: membership.username, role: membership.type.role,
      name: membership.user.name, email: membership.user.email,
      companyId: membership.companyId, companyName: membership.company.name,
    };
    return sessionResponse(user, next.refreshToken, token.session.expiresAt);
  }));
  if (!result) throw unauthorized('Refresh token inválido, vencido o revocado. Iniciá sesión nuevamente');
  return result;
}

export async function revokeMobileSession(refreshToken: string) {
  await unscoped(() => prisma.$transaction(async (tx) => {
    const token = await tx.mobileRefreshToken.findUnique({ where: { hash: hashRefreshToken(refreshToken) } });
    if (!token) return;
    await tx.$queryRaw`SELECT "id" FROM "MobileSession" WHERE "id" = ${token.sessionId} FOR UPDATE`;
    await tx.mobileSession.updateMany({ where: { id: token.sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }));
}
