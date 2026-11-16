import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { readMercadoPagoBillingResource } from './providers/mercadoPagoRead.js';
import { verifyAuthorizedBillingPayment } from './providers/billingVerification.js';
import { billingAmountMatches } from './providers/billingAmount.js';
import { calculateMonthlyPaidPeriod } from './billing.period.js';

export async function processTestBillingPayment(eventId: number, transport: typeof fetch = fetch): Promise<'RECORDED' | 'DEFERRED'> {
  const config = env.billingMpTest;
  if (!config.enabled || !config.webhookEnabled || !config.accessToken) throw new AppError(503, 'BILLING_PROCESSOR_DISABLED', 'El procesador de prueba está desactivado.');
  const event = await prisma.ownerBillingWebhookEvent.findUnique({ where: { id: eventId } });
  if (!event || event.provider !== 'MERCADOPAGO') throw new AppError(404, 'BILLING_EVENT_NOT_FOUND', 'No se encontró el evento de facturación.');
  if (event.status === 'PROCESSED' || event.topic !== 'subscription_authorized_payment') return 'DEFERRED';
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
    await prisma.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, status: { not: 'PROCESSED' } }, data: { attempts: { increment: 1 }, lastError: `REQUIERE_REVISION:${verified.reason}` } });
    throw new AppError(503, 'BILLING_PAYMENT_REVIEW', 'El pago requiere conciliación antes de procesarse.');
  }
  await prisma.$transaction(async (tx) => {
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
    if (existing) {
      if (existing.contractId !== verified.contractId || existing.status !== 'APPROVED' || !existing.paidAt || existing.paidAt.getTime() !== verified.paidAt.getTime() || !billingAmountMatches({ expectedAmount: existing.amount.toFixed(2), expectedCurrency: existing.currency, receivedAmount: verified.amount, receivedCurrency: verified.currency })) {
        throw new AppError(409, 'BILLING_PAYMENT_CONFLICT', 'El pago ya está registrado con otros datos.');
      }
    }
    const payment = existing ?? await tx.ownerBillingPayment.create({ data: { contractId: verified.contractId, provider: 'MERCADOPAGO', providerPaymentId: verified.paymentId, status: 'APPROVED', amount: verified.amount, currency: verified.currency, paidAt: verified.paidAt } });
    const previousForPayment = await tx.ownerBillingPeriod.findUnique({ where: { paymentId: payment.id } });
    if (previousForPayment) {
      if (previousForPayment.contractId !== verified.contractId || previousForPayment.providerInstallmentId !== verified.installmentId || previousForPayment.providerScheduledAt?.getTime() !== verified.scheduledAt.getTime()) {
        throw new AppError(409, 'BILLING_PAYMENT_CONFLICT', 'El período registrado no coincide con la cuota.');
      }
    } else {
      const latest = await tx.ownerBillingPeriod.findFirst({ where: { contract: { accountId: contract.accountId } }, orderBy: { endsAt: 'desc' }, select: { endsAt: true, providerScheduledAt: true } });
      if (latest && (!latest.providerScheduledAt || verified.scheduledAt.getTime() <= latest.providerScheduledAt.getTime())) {
        throw new AppError(409, 'BILLING_PERIOD_REVIEW', 'La cuota llegó fuera de orden y requiere conciliación.');
      }
      const paidAt = new Date(Math.max(verified.paidAt.getTime(), verified.scheduledAt.getTime()));
      const period = calculateMonthlyPaidPeriod({ paidAt, trialEndsAt: account.trialEndsAt, previousPeriodEnd: latest?.endsAt ?? null });
      await tx.ownerBillingPeriod.create({ data: {
        contractId: verified.contractId, paymentId: payment.id, providerInstallmentId: verified.installmentId, providerScheduledAt: verified.scheduledAt,
        startsAt: period.startsAt, endsAt: period.endsAt, amount: verified.amount, currency: verified.currency,
      } });
    }
    await tx.ownerBillingWebhookEvent.updateMany({ where: { id: eventId, status: { not: 'PROCESSED' } }, data: { status: 'PROCESSED', processedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
  });
  return 'RECORDED';
}
