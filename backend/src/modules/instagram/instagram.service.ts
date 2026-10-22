import crypto from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { ChannelType } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';
import { encryptSecret, splitEncrypted } from '../../lib/secretBox.js';
import { IG_SCOPES, IG_WEBHOOK_FIELDS, buildAuthorizeUrl, signOauthState, verifyOauthState, type InstagramOauthState } from './instagram.oauth.js';
import { exchangeCodeForToken, exchangeForLongLivedToken, getIgProfile, subscribeApp } from './instagram.client.js';
import { unscoped } from '../../lib/tenant.js';

const ADAPTER_CHANNEL = ChannelType.INSTAGRAM;

function buildRedirectTo(ok: boolean, reason?: string): string {
  const url = new URL('/settings/instagram', env.ig.frontendUrl);
  if (ok) url.searchParams.set('connected', 'instagram');
  url.searchParams.set('ok', ok ? '1' : '0');
  if (reason) url.searchParams.set('reason', reason);
  return url.toString();
}

export function buildAuthUrl(companyId: number, uid: string): { url: string; state: string } {
  const csrf = crypto.randomUUID();
  const payload: InstagramOauthState = {
    companyId,
    uid,
    csrf,
    ts: Date.now(),
  };
  const state = signOauthState(payload);
  const url = buildAuthorizeUrl(state);
  return { url, state };
}

export async function handleCallback(code: string, state: string, expectedUid?: string): Promise<{ redirectTo: string }> {
  let payload: InstagramOauthState;
  try {
    payload = verifyOauthState(state);
  } catch (e: any) {
    const reason = e?.message === 'state_expired' ? 'state_expired' : 'invalid_state';
    return { redirectTo: buildRedirectTo(false, reason) };
  }

  if (expectedUid && expectedUid !== payload.uid) {
    return { redirectTo: buildRedirectTo(false, 'invalid_state') };
  }

  const membership = await unscoped(() =>
    prisma.userCompany.findFirst({
      where: {
        companyId: payload.companyId,
        isActive: true,
        type: { role: { in: ['ADMIN', 'OWNER'] } },
        user: {
          OR: [
            { id: Number(payload.uid) || -1 },
            { authUserId: payload.uid },
          ],
        },
      },
      select: { userId: true },
    }),
  );

  if (!membership) {
    return { redirectTo: buildRedirectTo(false, 'forbidden') };
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived.accessToken);
    const profile = await getIgProfile(longLived.accessToken);

    const enc = encryptSecret(longLived.accessToken);
    const { iv } = splitEncrypted(enc);
    const igUserId = profile.igUserId || shortLived.igUserId;
    const tokenExpiresAt = longLived.expiresIn
      ? new Date(Date.now() + longLived.expiresIn * 1000)
      : null;

    const account = {
      externalAccountId: igUserId,
      handle: profile.username ?? null,
      displayName: profile.username ?? null,
      accessTokenEnc: enc,
      accessTokenIv: iv,
      tokenExpiresAt,
      scopes: IG_SCOPES,
      status: 'ACTIVE' as const,
      metadata: { igUserId },
      connectedAt: new Date(),
    };

    await prisma.channelAccount.upsert({
      where: { companyId_channel: { companyId: payload.companyId, channel: ADAPTER_CHANNEL } },
      create: { companyId: payload.companyId, channel: ADAPTER_CHANNEL, ...account },
      update: account,
    });

    try {
      await subscribeApp(longLived.accessToken, IG_WEBHOOK_FIELDS);
    } catch (err) {
      console.warn('[instagram] no se pudo suscribir la cuenta a los webhooks:', err);
    }

    return { redirectTo: buildRedirectTo(true) };
  } catch (err) {
    console.error('[instagram] error en callback OAuth:', err);
    return { redirectTo: buildRedirectTo(false, 'oauth_failed') };
  }
}
