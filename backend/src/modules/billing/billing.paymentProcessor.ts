import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { readMercadoPagoBillingResource } from './providers/mercadoPagoRead.js';
import { verifyAuthorizedBillingPayment } from './providers/billingVerification.js';
import { recordTestBillingPayment } from './billing.paymentPersistence.js';
import { BILLING_LEASE_MS, billingRetryAt, billingRetryWhere } from './billing.retry.js';

export async function processTestBillingPayment(eventId: number, transport: typeof fetch = fetch): Promise<'RECORDED' | 'DEFERRED'> {
  const config = env.billingMpTest;
  if (!config.enabled || !config.webhookEnabled || !config.accessToken) throw new AppError(503, 'BILLING_PROCESSOR_DISABLED', 'El procesador de prueba está desactivado.');
  const now = new Date();
  const claimed = await prisma.ownerBillingWebhookEvent.updateMany({
    where: { id: eventId, ...billingRetryWhere(now) },
    data: { attempts: { increment: 1 }, lockedUntil: new Date(now.getTime() + BILLING_LEASE_MS) },
  });
  if (claimed.count !== 1) return 'DEFERRED';
  const event = await prisma.ownerBillingWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.provider !== 'MERCADOPAGO') throw new AppError(404, 'BILLING_EVENT_NOT_FOUND', 'No se encontró el evento de facturación.');
  if (event.status === 'PROCESSED' || event.topic !== 'subscription_authorized_payment') return 'DEFERRED';
  try {
    const options = { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport };
    const verified = await verifyAuthorizedBillingPayment(event.resourceId, {
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, options),
      findContract: async (providerSubscriptionId) => {
        const contract = await prisma.ownerBillingContract.findUnique({
          where: { provider_providerSubscriptionId: { provider: 'MERCADOPAGO', providerSubscriptionId } },
          select: { id: true, provider: true, providerSubscriptionId: true, status: true, amount: true, currency: true },
        });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
    });
    if (verified.result !== 'VERIFIED') {
      throw new AppError(503, 'BILLING_PAYMENT_REVIEW', 'El pago requiere conciliación antes de procesarse.');
    }
    await recordTestBillingPayment(verified, eventId);
    return 'RECORDED';
  } catch (error) {
    const nextAttemptAt = billingRetryAt(event.attempts, new Date());
    const code = error instanceof AppError && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_PROVIDER_OR_PROCESSING_FAILED';
    await prisma.ownerBillingWebhookEvent.updateMany({
      where: { id: eventId, attempts: event.attempts, status: { not: 'PROCESSED' } },
      data: { status: 'FAILED', lockedUntil: null, nextAttemptAt, lastError: code },
    });
    throw error;
  }
}
