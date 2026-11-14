import { verifyBillingPaymentEvidence, type BillingPaymentEvidence } from './billingEvidence.js';

type ProviderResource = 'authorizedPayment' | 'payment';

export interface BillingContractForVerification {
  id: number;
  provider: string;
  providerSubscriptionId: string | null;
  status: 'PENDING' | 'AUTHORIZED' | 'PAUSED' | 'CANCELED';
  amount: string;
  currency: string;
}

export type VerifiedBillingResult =
  | { result: 'VERIFIED'; contractId: number; providerSubscriptionId: string; installmentId: string; scheduledAt: Date; paymentId: string; paidAt: Date; amount: string; currency: 'ARS' }
  | { result: 'REVIEW'; reason: string };

function numericId(value: unknown): string | null {
  if (typeof value === 'string' && /^\d{1,200}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function verifyAuthorizedBillingPayment(
  authorizedPaymentId: string,
  dependencies: {
    read: (resource: ProviderResource, id: string) => Promise<unknown>;
    findContract: (providerSubscriptionId: string) => Promise<BillingContractForVerification | null>;
  },
): Promise<VerifiedBillingResult> {
  if (!numericId(authorizedPaymentId)) return { result: 'REVIEW', reason: 'INVALID_RESOURCE' };
  const authorized = record(await dependencies.read('authorizedPayment', authorizedPaymentId));
  const providerSubscriptionId = authorized?.preapproval_id;
  if (!authorized || numericId(authorized.id) !== authorizedPaymentId || typeof providerSubscriptionId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(providerSubscriptionId)) {
    return { result: 'REVIEW', reason: 'INVALID_AUTHORIZED_PAYMENT' };
  }
  const contract = await dependencies.findContract(providerSubscriptionId);
  if (!contract || contract.provider !== 'MERCADOPAGO' || contract.providerSubscriptionId !== providerSubscriptionId || contract.currency !== 'ARS' || !['PENDING', 'AUTHORIZED'].includes(contract.status)) {
    return { result: 'REVIEW', reason: 'CONTRACT_NOT_ELIGIBLE' };
  }
  const paymentId = numericId(record(authorized.payment)?.id);
  if (!paymentId) return { result: 'REVIEW', reason: 'PAYMENT_NOT_AVAILABLE' };
  const payment = await dependencies.read('payment', paymentId);
  const evidence: BillingPaymentEvidence = verifyBillingPaymentEvidence({
    contractId: contract.id, providerSubscriptionId, authorizedPaymentId, expectedAmount: contract.amount, authorizedPayment: authorized, payment,
  });
  if (!evidence.valid) return { result: 'REVIEW', reason: evidence.reason };
  return { result: 'VERIFIED', contractId: contract.id, providerSubscriptionId, installmentId: authorizedPaymentId, scheduledAt: evidence.scheduledAt, paymentId: evidence.paymentId, paidAt: evidence.paidAt, amount: contract.amount, currency: 'ARS' };
}
