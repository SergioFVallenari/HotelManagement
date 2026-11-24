import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { billingAmountMatches } from './providers/billingAmount.js';
import { subscriptionTransition, type BillingContractStatus, type VerifiedSubscription } from './providers/billingSubscription.js';

export interface RecordedSubscriptionState {
  result: 'UPDATED' | 'UNCHANGED' | 'STALE';
  status: BillingContractStatus;
  providerUpdatedAt: Date | null;
}

export async function recordTestSubscriptionState(subscription: VerifiedSubscription, eventId?: number): Promise<RecordedSubscriptionState> {
  if (env.appEnv !== 'testing' || !env.billingMpTest.enabled) throw new AppError(503, 'BILLING_PROCESSOR_DISABLED', 'El procesador de prueba está desactivado.');
  return prisma.$transaction(async (tx) => {
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
    if (eventId !== undefined) {
      await tx.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date(), lockedUntil: null, nextAttemptAt: null, lastError: null } });
    }
    return {
      result: transition.result === 'UPDATE' ? 'UPDATED' : transition.result,
      status: transition.result === 'UPDATE' ? subscription.status : contract.status,
      providerUpdatedAt: transition.result === 'UPDATE' ? subscription.providerUpdatedAt : contract.providerUpdatedAt,
    };
  });
}
