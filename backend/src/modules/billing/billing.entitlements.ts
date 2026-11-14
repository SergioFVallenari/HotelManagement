import { effectiveBillingStatus, type BillingStatus, type StoredBillingStatus } from './billing.status.js';

export type ObservedLimit = 'MAX_ROOMS' | 'MAX_USERS';

export const TRIAL_LIMITS: Readonly<Record<ObservedLimit, number>> = { MAX_ROOMS: 5, MAX_USERS: 3 };

export function evaluateObservation(input: {
  status: StoredBillingStatus;
  trialEndsAt: Date | null;
  now: Date;
  limit: ObservedLimit;
  activeCount: number;
  paidActive?: boolean;
}): { effectiveStatus: BillingStatus; maximum: number | null; exceeded: boolean } {
  const effectiveStatus = effectiveBillingStatus(input.status, input.trialEndsAt, input.now, input.paidActive).status;
  if (effectiveStatus === 'GRANDFATHERED') return { effectiveStatus, maximum: null, exceeded: false };
  const maximum = TRIAL_LIMITS[input.limit];
  return { effectiveStatus, maximum, exceeded: input.activeCount > maximum };
}
