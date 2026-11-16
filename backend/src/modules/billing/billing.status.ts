export type StoredBillingStatus = 'TRIALING' | 'GRANDFATHERED' | 'EXPIRED';
export type BillingStatus = StoredBillingStatus | 'ACTIVE';

export function effectiveBillingStatus(status: StoredBillingStatus, trialEndsAt: Date | null, now: Date, paidActive = false): {
  status: BillingStatus;
  daysRemaining: number | null;
} {
  if (status === 'GRANDFATHERED') return { status, daysRemaining: null };
  if (paidActive) return { status: 'ACTIVE', daysRemaining: null };
  if (!trialEndsAt) throw new Error('La suscripción no tiene fecha de vencimiento');
  const remaining = trialEndsAt.getTime() - now.getTime();
  if (status === 'EXPIRED' || remaining <= 0) return { status: 'EXPIRED', daysRemaining: 0 };
  return { status: 'TRIALING', daysRemaining: Math.ceil(remaining / 86_400_000) };
}
