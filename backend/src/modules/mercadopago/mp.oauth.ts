import jwt from 'jsonwebtoken';
import { MercadoPagoConfig, User } from 'mercadopago';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { decryptSecret, encryptSecret } from './mp.crypto.js';

export interface MpTokenBundle {
  accessToken: string;
  refreshToken: string;
  mpUserId: string;
  liveMode: boolean;
}

export interface MpConnectionStatus {
  connected: boolean;
  mpUserId?: string;
  mpEmail?: string | null;
  connectedAt?: Date;
  lastRefreshedAt?: Date;
}

function requireAppCredentials(): void {
  if (!env.mp.appId || !env.mp.clientSecret) {
    throw new AppError(500, 'MP_NOT_CONFIGURED', 'Faltan las credenciales de la aplicación de MercadoPago (MP_APP_ID / MP_CLIENT_SECRET) en el servidor');
  }
}

export function buildAuthorizeUrl(state: string): string {
  requireAppCredentials();
  const url = new URL('authorization', env.mp.siteUrl);
  url.searchParams.set('client_id', env.mp.appId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('redirect_uri', env.mp.redirectUri);
  url.searchParams.set('scope', 'offline_access');
  url.searchParams.set('state', state);
  return url.toString();
}

async function tokenRequest(params: Record<string, string>): Promise<MpTokenBundle> {
  requireAppCredentials();
  const body = new URLSearchParams({
    client_id: env.mp.appId,
    client_secret: env.mp.clientSecret,
    ...params,
  });

  const res = await fetch(`${env.mp.apiUrl}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AppError(502, 'MP_OAUTH_FAILED', `MercadoPago rechazó la operación de token (HTTP ${res.status})`, detail.slice(0, 400));
  }
  const data = (await res.json()) as Record<string, unknown>;
  const accessToken = data.access_token;
  const refreshToken = data.refresh_token;
  const mpUserId = data.user_id;
  if (typeof accessToken !== 'string' || !accessToken || mpUserId === undefined) {
    throw new AppError(502, 'MP_OAUTH_FAILED', 'MercadoPago no devolvió un token válido');
  }
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' && refreshToken ? refreshToken : '',
    mpUserId: String(mpUserId),
    liveMode: data.live_mode === true,
  };
}

export async function exchangeAuthorizationCode(code: string): Promise<MpTokenBundle> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.mp.redirectUri,
  });
}

export async function refreshSellerTokens(refreshToken: string): Promise<MpTokenBundle> {
  if (!refreshToken) {
    throw new AppError(409, 'MP_REFRESH_TOKEN_MISSING', 'La cuenta de MercadoPago no tiene token de renovación. Reconectala.');
  }
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export async function fetchSellerEmail(accessToken: string): Promise<string | null> {
  const client = new MercadoPagoConfig({ accessToken });
  const user = await new User(client).get() as { email?: string };
  return user.email ?? null;
}

export function signOauthState(companyId: number, returnTo: string): string {
  return jwt.sign({ companyId, returnTo }, env.jwtSecret, { expiresIn: '10m' });
}

export function verifyOauthState(state: string): { companyId: number; returnTo: string } {
  try {
    const payload = jwt.verify(state, env.jwtSecret) as { companyId?: number; returnTo?: string };
    if (typeof payload.companyId !== 'number' || typeof payload.returnTo !== 'string') {
      throw new Error('state inválido');
    }
    return { companyId: payload.companyId, returnTo: payload.returnTo };
  } catch {
    throw new AppError(400, 'MP_OAUTH_STATE_INVALID', 'El estado de la conexión es inválido o expiró. Volvé a intentar');
  }
}

export async function getConnection(companyId: number): Promise<MpConnectionStatus> {
  const account = await prisma.companyMpAccount.findUnique({ where: { companyId } });
  if (!account) return { connected: false };
  return {
    connected: true,
    mpUserId: account.mpUserId,
    mpEmail: account.mpEmail,
    connectedAt: account.connectedAt,
    lastRefreshedAt: account.lastRefreshedAt,
  };
}

export async function connectAccount(companyId: number, bundle: MpTokenBundle, email: string | null): Promise<void> {
  const data = {
    mpUserId: bundle.mpUserId,
    mpEmail: email,
    accessTokenEncrypted: encryptSecret(bundle.accessToken),
    refreshTokenEncrypted: bundle.refreshToken ? encryptSecret(bundle.refreshToken) : '',
    connectedAt: new Date(),
    lastRefreshedAt: new Date(),
  };
  await prisma.companyMpAccount.upsert({
    where: { companyId },
    update: data,
    create: { companyId, ...data },
  });
}

export async function disconnectAccount(companyId: number): Promise<void> {
  await prisma.companyMpAccount.deleteMany({ where: { companyId } });
}