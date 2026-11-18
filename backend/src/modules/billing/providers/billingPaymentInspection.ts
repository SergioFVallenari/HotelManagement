import { billingAmountMatches } from './billingAmount.js';
import type { BillingReadResource } from './mercadoPagoRead.js';
import type { TestAccountEvidence } from './billingTestAccounts.js';

type Contract = {
  id: number;
  provider: string;
  providerSubscriptionId: string | null;
  amount: string;
  currency: string;
};

export type PaymentInspection =
  | { result: 'REVIEW'; reason: 'INVALID_PAYMENT' | 'NOT_APPROVED' | 'REFERENCE_UNAVAILABLE' | 'CONTRACT_UNAVAILABLE' | 'AMOUNT_MISMATCH' | 'SUBSCRIPTION_MISMATCH' }
  | { result: 'REVIEW'; reason: 'MODE_MISMATCH'; mode: 'LIVE' | 'MISSING' | 'INVALID'; accounts?: Exclude<TestAccountEvidence, { verified: true }>['reason'] }
  | { result: 'REVIEW'; reason: 'INSTALLMENT_REQUIRED'; contractId: number; providerSubscriptionId: string };

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function inspectBillingPayment(paymentId: string, dependencies: {
  read: (resource: BillingReadResource, id: string) => Promise<unknown>;
  findContract: (id: number) => Promise<Contract | null>;
  verifyTestAccounts?: (payment: unknown) => Promise<TestAccountEvidence>;
}): Promise<PaymentInspection> {
  if (!/^[1-9]\d{0,199}$/.test(paymentId)) return { result: 'REVIEW', reason: 'INVALID_PAYMENT' };
  const payment = record(await dependencies.read('payment', paymentId));
  const returnedId = payment?.id;
  if (!payment || !((typeof returnedId === 'string' && returnedId === paymentId) || (typeof returnedId === 'number' && Number.isSafeInteger(returnedId) && String(returnedId) === paymentId))) {
    return { result: 'REVIEW', reason: 'INVALID_PAYMENT' };
  }
  if (payment.live_mode !== false) {
    const mode = payment.live_mode === true ? 'LIVE' : Object.hasOwn(payment, 'live_mode') ? 'INVALID' : 'MISSING';
    if (mode !== 'LIVE' || !dependencies.verifyTestAccounts) return { result: 'REVIEW', reason: 'MODE_MISMATCH', mode };
    const accounts = await dependencies.verifyTestAccounts(payment);
    if (!accounts.verified) return { result: 'REVIEW', reason: 'MODE_MISMATCH', mode, accounts: accounts.reason };
  }
  if (payment.status !== 'approved' || payment.status_detail !== 'accredited') return { result: 'REVIEW', reason: 'NOT_APPROVED' };
  const reference = typeof payment.external_reference === 'string' ? /^LAIXIA-CONTRACT-([1-9]\d*)$/.exec(payment.external_reference) : null;
  const contractId = reference ? Number(reference[1]) : null;
  if (!contractId || !Number.isSafeInteger(contractId)) return { result: 'REVIEW', reason: 'REFERENCE_UNAVAILABLE' };
  const contract = await dependencies.findContract(contractId);
  if (!contract || contract.id !== contractId || contract.provider !== 'MERCADOPAGO' || !contract.providerSubscriptionId || contract.currency !== 'ARS') {
    return { result: 'REVIEW', reason: 'CONTRACT_UNAVAILABLE' };
  }
  const expected = { expectedAmount: contract.amount, expectedCurrency: contract.currency };
  if (!billingAmountMatches({ ...expected, receivedAmount: String(payment.transaction_amount), receivedCurrency: String(payment.currency_id) })) {
    return { result: 'REVIEW', reason: 'AMOUNT_MISMATCH' };
  }
  const subscription = record(await dependencies.read('subscription', contract.providerSubscriptionId));
  const recurring = record(subscription?.auto_recurring);
  if (!subscription || subscription.id !== contract.providerSubscriptionId || subscription.external_reference !== payment.external_reference || subscription.status !== 'authorized' || !recurring || recurring.frequency !== 1 || recurring.frequency_type !== 'months' || !billingAmountMatches({ ...expected, receivedAmount: String(recurring.transaction_amount), receivedCurrency: String(recurring.currency_id) })) {
    return { result: 'REVIEW', reason: 'SUBSCRIPTION_MISMATCH' };
  }
  return { result: 'REVIEW', reason: 'INSTALLMENT_REQUIRED', contractId, providerSubscriptionId: contract.providerSubscriptionId };
}
