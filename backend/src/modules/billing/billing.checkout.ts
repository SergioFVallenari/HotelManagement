import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { buildMercadoPagoPendingSubscription } from './providers/mercadoPagoCheckout.js';
import { BillingProviderOutcomeUnknown, BillingProviderRejected, createMercadoPagoPendingSubscription } from './providers/mercadoPagoClient.js';
import { trialIsActive } from './billing.period.js';
import { testCheckoutAvailable } from './billing.checkoutAvailability.js';

export async function beginTestCheckout(ownerId: number) {
  const config = env.billingMpTest;
  if (!testCheckoutAvailable(config)) {
    throw new AppError(503, 'BILLING_CHECKOUT_DISABLED', 'El checkout de prueba no está configurado.');
  }
  const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { email: true } });
  if (!owner) throw new AppError(404, 'BILLING_NOT_FOUND', 'No se encontró el titular de la suscripción');
  const payerEmail = owner.email;
  const returnUrl = new URL('/settings?tab=suscripcion', env.frontendUrl).toString();
  try {
    buildMercadoPagoPendingSubscription({ accountId: 1, contractId: 1, payerEmail, amount: config.monthlyPrice, currency: 'ARS', returnUrl, idempotencyKey: 'validacion' });
  } catch {
    throw new AppError(503, 'BILLING_CHECKOUT_CONFIG', 'La configuración del checkout de prueba no es válida.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const accounts = await tx.$queryRaw<Array<{ id: number; trialEndsAt: Date | null }>>`SELECT id, "trialEndsAt" FROM "OwnerBillingAccount" WHERE "ownerId" = ${ownerId} FOR UPDATE`;
    const account = accounts[0];
    if (!account) throw new AppError(404, 'BILLING_NOT_FOUND', 'No se encontró tu cuenta de suscripción');
    if (trialIsActive(account.trialEndsAt, new Date())) {
      throw new AppError(409, 'BILLING_TRIAL_ACTIVE', 'El checkout de prueba estará disponible al terminar el período gratuito.');
    }
    const existing = await tx.ownerBillingContract.findFirst({ where: { accountId: account.id, status: { in: ['PENDING', 'AUTHORIZED'] } }, orderBy: { id: 'desc' } });
    if (existing) {
      if (existing.status === 'PENDING' && existing.checkoutUrl) return { contract: existing, created: false };
      throw new AppError(409, 'BILLING_CHECKOUT_PENDING', 'Ya existe una suscripción en curso. Esperá la conciliación antes de volver a intentar.');
    }
    const contract = await tx.ownerBillingContract.create({ data: {
      accountId: account.id, provider: 'MERCADOPAGO', amount: config.monthlyPrice, currency: 'ARS', requestKey: randomUUID(),
    } });
    return { contract, created: true };
  });

  const { contract } = result;
  if (!result.created) return { checkoutUrl: contract.checkoutUrl!, status: 'PENDING' as const };
  let provider: Awaited<ReturnType<typeof createMercadoPagoPendingSubscription>>;
  try {
    provider = await createMercadoPagoPendingSubscription({
      accountId: contract.accountId, contractId: contract.id, payerEmail, amount: contract.amount.toFixed(2), currency: 'ARS', returnUrl, idempotencyKey: contract.requestKey,
    }, { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport: fetch });
  } catch (err) {
    console.warn('[billing] Checkout pendiente de conciliación', { contractId: contract.id, phase: 'PROVEEDOR', outcomeUnknown: err instanceof BillingProviderOutcomeUnknown, providerHttpStatus: err instanceof BillingProviderRejected ? err.status : null });
    throw new AppError(503, 'BILLING_CHECKOUT_PENDING', 'No se pudo completar el checkout. La solicitud quedó pendiente de conciliación; no se inició un segundo intento.');
  }
  try {
    await prisma.ownerBillingContract.update({ where: { id: contract.id }, data: { providerSubscriptionId: provider.externalId, checkoutUrl: provider.authorizationUrl } });
  } catch {
    console.warn('[billing] Checkout pendiente de conciliación', { contractId: contract.id, phase: 'PERSISTENCIA', outcomeUnknown: true, providerHttpStatus: null });
    throw new AppError(503, 'BILLING_CHECKOUT_PENDING', 'No se pudo completar el checkout. La solicitud quedó pendiente de conciliación; no se inició un segundo intento.');
  }
  return { checkoutUrl: provider.authorizationUrl, status: 'PENDING' as const };
}
