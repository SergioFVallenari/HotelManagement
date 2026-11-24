import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { readMercadoPagoBillingResource } from './providers/mercadoPagoRead.js';
import { readMercadoPagoBillingIdentity } from './providers/mercadoPagoIdentity.js';
import { billingAmountMatches } from './providers/billingAmount.js';
import { subscriptionTransition, verifyBillingSubscription } from './providers/billingSubscription.js';
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
    const subscription = verified.subscription;
    await prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "OwnerBillingContract" WHERE id = ${subscription.contractId} FOR UPDATE`;
      if (!locked[0]) throw new AppError(409, 'BILLING_CONTRACT_CHANGED', 'El contrato ya no está disponible.');
      const contract = await tx.ownerBillingContract.findUnique({ where: { id: subscription.contractId } });
      if (!contract || contract.provider !== 'MERCADOPAGO' || contract.providerSubscriptionId !== subscription.providerSubscriptionId || contract.intervalMonths !== 1 || !billingAmountMatches({ expectedAmount: contract.amount.toFixed(2), expectedCurrency: contract.currency, receivedAmount: subscription.amount, receivedCurrency: subscription.currency })) {
        throw new AppError(409, 'BILLING_CONTRACT_CHANGED', 'El contrato cambió durante la verificación.');
      }
      const transition = subscriptionTransition({ ...contract, amount: contract.amount.toFixed(2) }, subscription);
      if (transition.result === 'REVIEW') throw new AppError(409, 'BILLING_SUBSCRIPTION_REVIEW', 'El estado de la suscripción requiere revisión.');
      if (transition.result === 'UPDATE') {
        await tx.ownerBillingContract.update({ where: { id: contract.id }, data: { status: subscription.status, providerUpdatedAt: subscription.providerUpdatedAt } });
      }
      await tx.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date(), lockedUntil: null, nextAttemptAt: null, lastError: null } });
    });
    return 'RECORDED';
  } catch (error) {
    const code = reviewReason ? `BILLING_SUBSCRIPTION_REVIEW:${reviewReason}` : error instanceof AppError && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_PROVIDER_OR_PROCESSING_FAILED';
    await prisma.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, attempts: event.attempts, status: { not: 'PROCESSED' } }, data: { status: 'FAILED', lockedUntil: null, nextAttemptAt: billingRetryAt(event.attempts, new Date()), lastError: code } });
    throw error;
  }
}
