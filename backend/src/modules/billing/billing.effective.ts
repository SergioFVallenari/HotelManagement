import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { effectiveBillingStatus, type StoredBillingStatus } from './billing.status.js';

export function validPaidPeriod(period: { contractId: number; amount: { toString(): string }; currency: string; payment: { contractId: number; amount: { toString(): string }; currency: string; paidAt: Date | null } | null } | null): boolean {
  return Boolean(period && period.payment?.contractId === period.contractId && period.payment.paidAt && period.payment.currency === period.currency && period.payment.amount.toString() === period.amount.toString());
}

export async function resolveOwnerBillingStatus(account: { id: number; status: StoredBillingStatus; trialEndsAt: Date | null }, now: Date) {
  const period = env.billingPaidAccessTesting && account.status !== 'GRANDFATHERED'
    ? await prisma.ownerBillingPeriod.findFirst({
        where: { contract: { accountId: account.id }, startsAt: { lte: now }, endsAt: { gt: now }, payment: { is: { status: 'APPROVED' } } },
        orderBy: { endsAt: 'desc' },
        select: { contractId: true, endsAt: true, amount: true, currency: true, payment: { select: { contractId: true, amount: true, currency: true, paidAt: true } } },
      })
    : null;
  const validPeriod = validPaidPeriod(period) ? period : null;
  return { ...effectiveBillingStatus(account.status, account.trialEndsAt, now, Boolean(validPeriod)), currentPeriodEnd: validPeriod?.endsAt ?? null };
}
