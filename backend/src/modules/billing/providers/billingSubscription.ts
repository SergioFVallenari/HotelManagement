import { billingAmountMatches } from './billingAmount.js';

export type BillingContractStatus = 'PENDING' | 'AUTHORIZED' | 'PAUSED' | 'CANCELED';

export interface SubscriptionContract {
  id: number;
  provider: string;
  providerSubscriptionId: string | null;
  status: BillingContractStatus;
  amount: string;
  currency: string;
  intervalMonths: number;
  providerUpdatedAt: Date | null;
}

export interface VerifiedSubscription {
  contractId: number;
  providerSubscriptionId: string;
  status: BillingContractStatus;
  providerUpdatedAt: Date;
  amount: string;
  currency: string;
}

type Review = { result: 'REVIEW'; reason: 'CONTRACT_UNAVAILABLE' | 'SUBSCRIPTION_MISMATCH' | 'SELLER_MISMATCH' | 'AMOUNT_MISMATCH' | 'UNSUPPORTED_STATUS' | 'INVALID_TIMESTAMP' | 'INVALID_TRANSITION' | 'VERSION_CONFLICT' };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function id(value: unknown): string | null {
  if (typeof value === 'string' && /^[1-9]\d{0,199}$/.test(value)) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

export function subscriptionTransition(contract: SubscriptionContract, verified: VerifiedSubscription): Review | { result: 'UPDATE' | 'UNCHANGED' | 'STALE' } {
  if (contract.providerUpdatedAt) {
    if (verified.providerUpdatedAt < contract.providerUpdatedAt) return { result: 'STALE' };
    if (verified.providerUpdatedAt.getTime() === contract.providerUpdatedAt.getTime()) {
      return contract.status === verified.status ? { result: 'UNCHANGED' } : { result: 'REVIEW', reason: 'VERSION_CONFLICT' };
    }
  }
  if ((contract.status === 'CANCELED' && verified.status !== 'CANCELED') || (contract.status !== 'PENDING' && verified.status === 'PENDING')) {
    return { result: 'REVIEW', reason: 'INVALID_TRANSITION' };
  }
  return { result: 'UPDATE' };
}

export async function verifyBillingSubscription(resourceId: string, dependencies: {
  findContract: (resourceId: string) => Promise<SubscriptionContract | null>;
  readSubscription: (resourceId: string) => Promise<unknown>;
  readIdentity: () => Promise<unknown>;
  now: Date;
}): Promise<Review | { result: 'VERIFIED'; subscription: VerifiedSubscription }> {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(resourceId)) return { result: 'REVIEW', reason: 'SUBSCRIPTION_MISMATCH' };
  const contract = await dependencies.findContract(resourceId);
  if (!contract || !Number.isSafeInteger(contract.id) || contract.id <= 0 || contract.provider !== 'MERCADOPAGO' || contract.providerSubscriptionId !== resourceId || contract.intervalMonths !== 1) {
    return { result: 'REVIEW', reason: 'CONTRACT_UNAVAILABLE' };
  }
  const subscription = record(await dependencies.readSubscription(resourceId));
  if (!subscription || subscription.id !== resourceId || subscription.external_reference !== `LAIXIA-CONTRACT-${contract.id}`) {
    return { result: 'REVIEW', reason: 'SUBSCRIPTION_MISMATCH' };
  }
  const statuses: Record<string, BillingContractStatus> = { pending: 'PENDING', authorized: 'AUTHORIZED', paused: 'PAUSED', cancelled: 'CANCELED' };
  const status = typeof subscription.status === 'string' && Object.hasOwn(statuses, subscription.status) ? statuses[subscription.status] : null;
  if (!status) return { result: 'REVIEW', reason: 'UNSUPPORTED_STATUS' };
  const recurring = record(subscription.auto_recurring);
  if (!recurring || recurring.frequency !== 1 || recurring.frequency_type !== 'months' || !billingAmountMatches({ expectedAmount: contract.amount, expectedCurrency: contract.currency, receivedAmount: String(recurring.transaction_amount), receivedCurrency: String(recurring.currency_id) })) {
    return { result: 'REVIEW', reason: 'AMOUNT_MISMATCH' };
  }
  const modified = subscription.last_modified;
  const timestamp = typeof modified === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(modified) ? new Date(modified) : null;
  if (!timestamp || !Number.isFinite(timestamp.getTime()) || !Number.isFinite(dependencies.now.getTime()) || timestamp.getTime() > dependencies.now.getTime() + 300_000) {
    return { result: 'REVIEW', reason: 'INVALID_TIMESTAMP' };
  }
  const seller = record(await dependencies.readIdentity());
  const collectorId = id(subscription.collector_id);
  if (!collectorId || id(seller?.id) !== collectorId) return { result: 'REVIEW', reason: 'SELLER_MISMATCH' };
  const verified: VerifiedSubscription = { contractId: contract.id, providerSubscriptionId: resourceId, status, providerUpdatedAt: timestamp, amount: contract.amount, currency: contract.currency };
  const transition = subscriptionTransition(contract, verified);
  if (transition.result === 'REVIEW') return transition;
  return { result: 'VERIFIED', subscription: verified };
}
