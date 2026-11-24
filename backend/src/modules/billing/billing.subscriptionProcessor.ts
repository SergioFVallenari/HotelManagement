import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { readMercadoPagoBillingResource } from './providers/mercadoPagoRead.js';
import { readMercadoPagoBillingIdentity } from './providers/mercadoPagoIdentity.js';
import { verifyBillingSubscription } from './providers/billingSubscription.js';
import { recordTestSubscriptionState } from './billing.subscriptionPersistence.js';
import { BILLING_LEASE_MS, billingRetryAt, billingRetryWhere } from './billing.retry.js';

export async function processTestBillingSubscription(eventId: number, transport: typeof fetch = fetch): Promise<'RECORDED' | 'DEFERRED'> {
  const config = env.billingMpTest;
  if (env.appEnv !== 'testing' || !config.enabled || !config.webhookEnabled || !config.accessToken) throw new AppError(503, 'BILLING_PROCESSOR_DISABLED', 'El procesador de prueba está desactivado.');
  const now = new Date();
  const claim = await prisma.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, ...billingRetryWhere(now, 'subscription_preapproval') }, data: { attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + BILLING_LEASE_MS) } });
  if (claim.count !== 1) return 'DEFERRED';
  const event = await prisma.ownerBillingWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.status === 'PROCESSED') return 'DEFERRED';
  let reviewReason: string | null = null;
  try {
    const options = { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport };
    const verified = await verifyBillingSubscription(event.resourceId, {
      now,
      findContract: async (providerSubscriptionId) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { provider_providerSubscriptionId: { provider: 'MERCADOPAGO', providerSubscriptionId } } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
      readSubscription: (id) => readMercadoPagoBillingResource('subscription', id, options),
      readIdentity: () => readMercadoPagoBillingIdentity('me', options),
    });
    if (verified.result === 'REVIEW') {
      reviewReason = verified.reason;
      throw new AppError(409, 'BILLING_SUBSCRIPTION_REVIEW', 'La suscripción requiere revisión antes de actualizar el contrato.');
    }
    await recordTestSubscriptionState(verified.subscription, eventId);
    return 'RECORDED';
  } catch (error) {
    const code = reviewReason ? `BILLING_SUBSCRIPTION_REVIEW:${reviewReason}` : error instanceof AppError && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_PROVIDER_OR_PROCESSING_FAILED';
    await prisma.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, attempts: event.attempts, status: { not: 'PROCESSED' } }, data: { status: 'FAILED', lockedUntil: null, nextAttemptAt: billingRetryAt(event.attempts, new Date()), lastError: code } });
    throw error;
  }
}
