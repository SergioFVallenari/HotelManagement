import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { billingAmountMatches } from './providers/billingAmount.js';
import type { VerifiedBillingResult } from './providers/billingVerification.js';
import { calculateMonthlyPaidPeriod } from './billing.period.js';

export type VerifiedTestBillingPayment = Extract<VerifiedBillingResult, { result: 'VERIFIED' }>;
export type RecordedTestBillingPayment = { result: 'RECORDED' | 'ALREADY_RECORDED'; startsAt: Date; endsAt: Date };

export async function recordTestBillingPayment(verified: VerifiedTestBillingPayment, eventId?: number): Promise<RecordedTestBillingPayment> {
  if (env.appEnv !== 'testing' || !env.billingMpTest.enabled) throw new AppError(503, 'BILLING_PROCESSOR_DISABLED', 'El procesador de prueba está desactivado.');
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: number }>>`SELECT id FROM "OwnerBillingContract" WHERE id = ${verified.contractId} FOR UPDATE`;
    if (!locked[0]) throw new AppError(409, 'BILLING_CONTRACT_CHANGED', 'El contrato ya no está disponible.');
    const contract = await tx.ownerBillingContract.findUnique({ where: { id: verified.contractId }, select: { accountId: true, status: true, currency: true, amount: true, provider: true, providerSubscriptionId: true, intervalMonths: true } });
    if (!contract || !['PENDING', 'AUTHORIZED'].includes(contract.status) || contract.provider !== 'MERCADOPAGO' || contract.providerSubscriptionId !== verified.providerSubscriptionId || !billingAmountMatches({ expectedAmount: contract.amount.toFixed(2), expectedCurrency: contract.currency, receivedAmount: verified.amount, receivedCurrency: verified.currency })) {
      throw new AppError(409, 'BILLING_CONTRACT_CHANGED', 'El contrato cambió durante la verificación.');
    }
    if (contract.intervalMonths !== 1) throw new AppError(409, 'BILLING_INTERVAL_UNSUPPORTED', 'La periodicidad del contrato requiere revisión.');
    await tx.$queryRaw`SELECT id FROM "OwnerBillingAccount" WHERE id = ${contract.accountId} FOR UPDATE`;
    const account = await tx.ownerBillingAccount.findUnique({ where: { id: contract.accountId }, select: { trialEndsAt: true } });
    if (!account) throw new AppError(409, 'BILLING_CONTRACT_CHANGED', 'La cuenta de facturación ya no está disponible.');
    const existing = await tx.ownerBillingPayment.findUnique({ where: { provider_providerPaymentId: { provider: 'MERCADOPAGO', providerPaymentId: verified.paymentId } } });
    if (existing && (existing.contractId !== verified.contractId || existing.status !== 'APPROVED' || !existing.paidAt || existing.paidAt.getTime() !== verified.paidAt.getTime() || !billingAmountMatches({ expectedAmount: existing.amount.toFixed(2), expectedCurrency: existing.currency, receivedAmount: verified.amount, receivedCurrency: verified.currency }))) {
      throw new AppError(409, 'BILLING_PAYMENT_CONFLICT', 'El pago ya está registrado con otros datos.');
    }
    const payment = existing ?? await tx.ownerBillingPayment.create({ data: { contractId: verified.contractId, provider: 'MERCADOPAGO', providerPaymentId: verified.paymentId, status: 'APPROVED', amount: verified.amount, currency: verified.currency, paidAt: verified.paidAt } });
    const previousForPayment = await tx.ownerBillingPeriod.findUnique({ where: { paymentId: payment.id } });
    let period: { startsAt: Date; endsAt: Date };
    if (previousForPayment) {
      if (previousForPayment.contractId !== verified.contractId || previousForPayment.providerInstallmentId !== verified.installmentId || previousForPayment.providerScheduledAt?.getTime() !== verified.scheduledAt.getTime() || !billingAmountMatches({ expectedAmount: previousForPayment.amount.toFixed(2), expectedCurrency: previousForPayment.currency, receivedAmount: verified.amount, receivedCurrency: verified.currency })) {
        throw new AppError(409, 'BILLING_PAYMENT_CONFLICT', 'El período registrado no coincide con la cuota.');
      }
      period = previousForPayment;
    } else {
      const latest = await tx.ownerBillingPeriod.findFirst({ where: { contract: { accountId: contract.accountId } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true, providerScheduledAt: true } });
      if (latest && (!latest.providerScheduledAt || verified.scheduledAt.getTime() <= latest.providerScheduledAt.getTime())) {
        throw new AppError(409, 'BILLING_PERIOD_REVIEW', 'La cuota llegó fuera de orden y requiere conciliación.');
      }
      const paidAt = new Date(Math.max(verified.paidAt.getTime(), verified.scheduledAt.getTime()));
      period = calculateMonthlyPaidPeriod({ paidAt, trialEndsAt: account.trialEndsAt, previousPeriodEnd: latest?.endsAt ?? null });
      await tx.ownerBillingPeriod.create({ data: {
        contractId: verified.contractId, paymentId: payment.id, providerInstallmentId: verified.installmentId, providerScheduledAt: verified.scheduledAt,
        startsAt: period.startsAt, endsAt: period.endsAt, amount: verified.amount, currency: verified.currency,
      } });
    }
    if (eventId !== undefined) {
      await tx.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
    }
    return { result: previousForPayment ? 'ALREADY_RECORDED' : 'RECORDED', startsAt: period.startsAt, endsAt: period.endsAt };
  });
}
