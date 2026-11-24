import { verifyBillingPaymentEvidence, verifyDeclaredTestBillingPaymentEvidence, type BillingPaymentEvidence, type BillingEvidenceInput } from './billingEvidence.js';
import { verifyBillingTestAccounts, type DeclaredTestAccounts } from './billingTestAccounts.js';

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

interface VerificationDependencies {
  read: (resource: ProviderResource, id: string) => Promise<unknown>;
  findContract: (providerSubscriptionId: string) => Promise<BillingContractForVerification | null>;
}

export async function verifyAuthorizedBillingPayment(authorizedPaymentId: string, dependencies: VerificationDependencies): Promise<VerifiedBillingResult> {
  return verifyPayment(authorizedPaymentId, dependencies, async (input) => verifyBillingPaymentEvidence(input));
}

export async function verifyDeclaredTestAuthorizedBillingPayment(authorizedPaymentId: string, dependencies: VerificationDependencies & {
  declared: DeclaredTestAccounts;
  readIdentity: (id: string) => Promise<unknown>;
}): Promise<VerifiedBillingResult> {
  return verifyPayment(authorizedPaymentId, dependencies, async (input) => {
    const accounts = await verifyBillingTestAccounts(input.payment, dependencies.readIdentity, dependencies.declared);
    return verifyDeclaredTestBillingPaymentEvidence(input, accounts.verified);
  });
}

export async function verifyConfiguredTestBillingPayment(authorizedPaymentId: string, dependencies: VerificationDependencies & {
  configuredAccounts: DeclaredTestAccounts | null;
  readIdentity: (id: string) => Promise<unknown>;
}): Promise<VerifiedBillingResult> {
  if (!dependencies.configuredAccounts) return verifyAuthorizedBillingPayment(authorizedPaymentId, dependencies);
  return verifyDeclaredTestAuthorizedBillingPayment(authorizedPaymentId, { ...dependencies, declared: dependencies.configuredAccounts });
}

async function verifyPayment(
  authorizedPaymentId: string,
  dependencies: VerificationDependencies,
  validateEvidence: (input: BillingEvidenceInput) => Promise<BillingPaymentEvidence>,
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
  const evidence = await validateEvidence({
    contractId: contract.id, providerSubscriptionId, authorizedPaymentId, expectedAmount: contract.amount, authorizedPayment: authorized, payment,
  });
  if (!evidence.valid) return { result: 'REVIEW', reason: evidence.reason };
  return { result: 'VERIFIED', contractId: contract.id, providerSubscriptionId, installmentId: authorizedPaymentId, scheduledAt: evidence.scheduledAt, paymentId: evidence.paymentId, paidAt: evidence.paidAt, amount: contract.amount, currency: 'ARS' };
}
