import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { getTenantId } from '../../lib/tenant.js';
import { decryptSecret } from '../../lib/secretBox.js';
import { ChannelType } from '../../generated/prisma/client.js';
import { getAuthUrlSchema } from './instagram.schema.js';
import { buildAuthUrl, handleCallback } from './instagram.service.js';
import { unsubscribeApp } from './instagram.client.js';
import { syncChannelAccount } from '../channels/channels.service.js';

export async function getAuthUrlHandler(req: Request, res: Response): Promise<void> {
  const input = getAuthUrlSchema.parse(req.query);
  const companyId = input.companyId;

  const user = req.user;
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Se requiere autenticación');

  const membership = await prisma.userCompany.findFirst({
    where: {
      userId: user.id,
      companyId,
      isActive: true,
    },
    include: { type: true },
  });
  if (!membership || (membership.type.role !== 'ADMIN' && membership.type.role !== 'OWNER')) {
    throw new AppError(403, 'FORBIDDEN', 'Solo ADMIN o OWNER pueden conectar Instagram');
  }

  const uid = String(membership.userId);
  const { url } = buildAuthUrl(companyId, uid);
  res.json({ data: { url } });
}

export async function callbackHandler(req: Request, res: Response): Promise<void> {
  const query = req.query as Record<string, unknown>;
  const code = typeof query.code === 'string' ? query.code : '';
  const state = typeof query.state === 'string' ? query.state : '';

  if (!code || !state) {
    const { redirectTo } = await handleCallback('', '');
    res.redirect(redirectTo);
    return;
  }

  const { redirectTo } = await handleCallback(code, state);
  res.redirect(redirectTo);
}

export async function getStatusHandler(req: Request, res: Response): Promise<void> {
  const companyId = getTenantId();
  if (!companyId) throw new AppError(400, 'TENANT_REQUIRED', 'Falta tenant');

  const account = await prisma.channelAccount.findFirst({
    where: { channel: ChannelType.INSTAGRAM },
    select: {
      id: true,
      companyId: true,
      externalAccountId: true,
      handle: true,
      status: true,
      connectedAt: true,
      updatedAt: true,
      metadata: true,
    },
  });

  const metadata =
    account?.metadata && typeof account.metadata === 'object' && !Array.isArray(account.metadata)
      ? (account.metadata as Record<string, unknown>)
      : {};
  const lastSyncAt = typeof metadata.lastSyncAt === 'string' ? metadata.lastSyncAt : null;

  res.json({
    data: account
      ? {
          connected: account.status === 'ACTIVE',
          id: account.id,
          companyId: account.companyId,
          igBusinessAccountId: account.externalAccountId,
          username: account.handle,
          active: account.status === 'ACTIVE',
          connectedAt: account.connectedAt,
          updatedAt: account.updatedAt,
          lastSyncAt,
        }
      : { connected: false },
  });
}

export async function syncHandler(_req: Request, res: Response): Promise<void> {
  res.json({ data: await syncChannelAccount(ChannelType.INSTAGRAM) });
}

export async function disconnectHandler(req: Request, res: Response): Promise<void> {
  const companyId = getTenantId();
  if (!companyId) throw new AppError(400, 'TENANT_REQUIRED', 'Falta tenant');

  const account = await prisma.channelAccount.findFirst({
    where: { channel: ChannelType.INSTAGRAM },
    select: { id: true, accessTokenEnc: true },
  });
  if (!account) throw new AppError(404, 'IG_NOT_CONNECTED', 'No hay una cuenta de Instagram conectada');

  if (account.accessTokenEnc) {
    try {
      await unsubscribeApp(decryptSecret(account.accessTokenEnc));
    } catch (err) {
      console.warn('[instagram] no se pudieron desuscribir los webhooks al desconectar:', err);
    }
  }

  await prisma.channelAccount.delete({ where: { id: account.id } });
  res.status(204).end();
}
