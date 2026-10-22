import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';

export interface ShortLivedToken {
  accessToken: string;
  igUserId: string;
}

export interface LongLivedToken {
  accessToken: string;
  expiresIn?: number;
}

export interface IgProfile {
  igUserId: string;
  username?: string;
}

export async function exchangeCodeForToken(code: string): Promise<ShortLivedToken> {
  const params = new URLSearchParams({
    client_id: env.ig.appId,
    client_secret: env.ig.appSecret,
    grant_type: 'authorization_code',
    redirect_uri: env.ig.redirectUri,
    code,
  });

  const res = await fetch(env.ig.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'IG_OAUTH_TOKEN_EXCHANGE', 'No se pudo intercambiar el código de Instagram', { detail: text.slice(0, 200) });
  }

  const json = (await res.json()) as any;
  const payload = Array.isArray(json?.data) ? json.data[0] : json;
  const accessToken = payload?.access_token;
  const igUserId = payload?.user_id ?? payload?.id;

  if (!accessToken || !igUserId) {
    throw new AppError(502, 'IG_OAUTH_TOKEN_EXCHANGE', 'Respuesta de Instagram inválida al intercambiar el código');
  }
  return { accessToken: String(accessToken), igUserId: String(igUserId) };
}

export async function exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedToken> {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: env.ig.appSecret,
    access_token: shortLivedToken,
  });

  const res = await fetch(`${env.ig.graphHost}/access_token?${params.toString()}`, { method: 'GET' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'IG_TOKEN_LONG_LIVED', 'No se pudo obtener el token de larga duración de Instagram', { detail: text.slice(0, 200) });
  }

  const json = (await res.json()) as any;
  if (!json?.access_token) {
    throw new AppError(502, 'IG_TOKEN_LONG_LIVED', 'Respuesta inválida al obtener el token de Instagram');
  }
  return { accessToken: String(json.access_token), expiresIn: Number(json.expires_in) || undefined };
}

export async function getIgProfile(longLivedToken: string): Promise<IgProfile> {
  const res = await fetch(
    `${env.ig.graphApiUrl}/me?fields=user_id,username`,
    { method: 'GET', headers: { Authorization: `Bearer ${longLivedToken}` } },
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'IG_PROFILE_FETCH', 'No se pudo obtener el perfil de Instagram', { detail: text.slice(0, 200) });
  }

  const json = (await res.json()) as any;
  const payload = Array.isArray(json?.data) ? json.data[0] : json;
  const igUserId = payload?.user_id ?? payload?.id;
  if (!igUserId) {
    throw new AppError(502, 'IG_PROFILE_FETCH', 'Respuesta inválida al obtener el perfil de Instagram');
  }
  return { igUserId: String(igUserId), username: payload?.username ? String(payload.username) : undefined };
}

export function buildSubscribeUrl(accessToken: string, fields: string): string {
  const params = new URLSearchParams({
    subscribed_fields: fields,
    access_token: accessToken,
  });
  return `${env.ig.graphApiUrl}/me/subscribed_apps?${params.toString()}`;
}

export function buildUnsubscribeUrl(accessToken: string): string {
  const params = new URLSearchParams({ access_token: accessToken });
  return `${env.ig.graphApiUrl}/me/subscribed_apps?${params.toString()}`;
}

export async function subscribeApp(accessToken: string, fields: string): Promise<void> {
  const res = await fetch(buildSubscribeUrl(accessToken, fields), { method: 'POST' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'IG_SUBSCRIBE', 'No se pudo suscribir la app a los webhooks de Instagram', { detail: text.slice(0, 200) });
  }
}

export async function unsubscribeApp(accessToken: string): Promise<void> {
  const res = await fetch(buildUnsubscribeUrl(accessToken), { method: 'DELETE' });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new AppError(502, 'IG_UNSUBSCRIBE', 'No se pudieron desuscribir los webhooks de Instagram', { detail: text.slice(0, 200) });
  }
}
