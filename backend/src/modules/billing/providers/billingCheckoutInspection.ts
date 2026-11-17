import { reconcilePendingCheckout } from './mercadoPagoReconciliation.js';

export interface PendingCheckoutForInspection {
  id: number;
  ownerId: number;
  status: string;
  provider: string;
  providerSubscriptionId: string | null;
  checkoutUrl: string | null;
  amount: string;
  currency: string;
  intervalMonths: number;
  payerEmail: string | null;
}

export type CheckoutInspection =
  | { result: 'REVIEW'; reason: 'NOT_ELIGIBLE' | 'INCOMPLETE' | 'NOT_FOUND' | 'MULTIPLE' | 'MISMATCH' | 'POSSIBLE_MATCH' };

export async function inspectPendingCheckout(
  ownerId: number,
  dependencies: {
    findPending: (ownerId: number) => Promise<PendingCheckoutForInspection | null>;
    search: () => Promise<{ candidates: unknown[]; complete: boolean }>;
  },
): Promise<CheckoutInspection> {
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) return { result: 'REVIEW', reason: 'NOT_ELIGIBLE' };
  const contract = await dependencies.findPending(ownerId);
  if (!contract || contract.ownerId !== ownerId || contract.status !== 'PENDING' || contract.provider !== 'MERCADOPAGO' || contract.providerSubscriptionId !== null || contract.checkoutUrl !== null || contract.currency !== 'ARS' || contract.intervalMonths !== 1) {
    return { result: 'REVIEW', reason: 'NOT_ELIGIBLE' };
  }
  if (!contract.payerEmail) return { result: 'REVIEW', reason: 'INCOMPLETE' };
  const page = await dependencies.search();
  const match = reconcilePendingCheckout({ contractId: contract.id, expectedEmail: contract.payerEmail, expectedAmount: contract.amount, candidates: page.candidates, complete: page.complete });
  return match.result === 'RECOVERED' ? { result: 'REVIEW', reason: 'POSSIBLE_MATCH' } : match;
}
