import { MercadoPagoConfig, Order as OrderClient, Payment as PaymentClient, MPAuthenticationError } from 'mercadopago';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { decryptSecret, encryptSecret } from './mp.crypto.js';
import { refreshSellerTokens } from './mp.oauth.js';
import { captureMpFailures, toMpAppError } from './mp.errors.js';
import { buildOrderPayload, type OrderGuestData } from './mp.order.js';

export type { OrderGuestData } from './mp.order.js';

const ROTATE_AFTER_MS = 170 * 24 * 60 * 60 * 1000;

export function mpNotConnected() {
  return new AppError(409, 'MP_NOT_CONNECTED', 'Este hotel no tiene conectada una cuenta de MercadoPago. Conectala desde Pagos');
}

async function loadAccessToken(companyId: number, options: { forceRefresh?: boolean } = {}): Promise<string> {
  const account = await prisma.companyMpAccount.findUnique({ where: { companyId } });
  if (!account) throw mpNotConnected();

  let accessToken = decryptSecret(account.accessTokenEncrypted);
  if (!options.forceRefresh && Date.now() - account.lastRefreshedAt.getTime() < ROTATE_AFTER_MS) {
    return accessToken;
  }

  const refreshToken = decryptSecret(account.refreshTokenEncrypted);
  const bundle = await refreshSellerTokens(refreshToken);
  await prisma.companyMpAccount.update({
    where: { companyId },
    data: {
      accessTokenEncrypted: encryptSecret(bundle.accessToken),
      refreshTokenEncrypted: bundle.refreshToken ? encryptSecret(bundle.refreshToken) : account.refreshTokenEncrypted,
      lastRefreshedAt: new Date(),
    },
  });
  return bundle.accessToken;
}

export interface OrderResult {
  orderId: string;
  checkoutUrl: string;
}

function mapOrder(result: { id?: string; checkout_url?: string }): OrderResult {
  const orderId = result.id;
  const checkoutUrl = result.checkout_url;
  if (!orderId || !checkoutUrl) {
    throw new AppError(502, 'MP_ORDER_FAILED', 'MercadoPago no devolvió un link de pago válido');
  }
  return { orderId, checkoutUrl };
}

export async function createOrderForReservation(opts: {
  companyId: number;
  code: string;
  amount: number;
  guest?: OrderGuestData | null;
  checkIn?: string | null;
}): Promise<OrderResult> {
  captureMpFailures();
  const payload = buildOrderPayload({
    companyId: opts.companyId,
    code: opts.code,
    amount: opts.amount,
    guest: opts.guest,
    checkIn: opts.checkIn,
    appUrl: env.mp.appUrl,
  });

  const create = (accessToken: string) => {
    const client = new MercadoPagoConfig({ accessToken });
    return new OrderClient(client).create({ body: payload });
  };

  try {
    return mapOrder(await create(await loadAccessToken(opts.companyId)));
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err instanceof MPAuthenticationError) {
      try {
        return mapOrder(await create(await loadAccessToken(opts.companyId, { forceRefresh: true })));
      } catch (retryErr) {
        if (retryErr instanceof AppError) throw retryErr;
        throw toMpAppError(retryErr, 'MP_ORDER_FAILED', 'MercadoPago rechazó la creación del link de pago');
      }
    }
    throw toMpAppError(err, 'MP_ORDER_FAILED', 'MercadoPago rechazó la creación del link de pago');
  }
}

export async function getMpPayment(companyId: number, paymentId: string) {
  const accessToken = await loadAccessToken(companyId);
  const client = new MercadoPagoConfig({ accessToken });
  return new PaymentClient(client).get({ id: paymentId });
}