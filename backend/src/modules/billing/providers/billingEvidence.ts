import { billingAmountMatches } from './billingAmount.js';

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function id(value: unknown): string | null {
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return null;
}

function amount(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

export type BillingPaymentEvidence =
  | { valid: true; paymentId: string; paidAt: Date; scheduledAt: Date }
  | { valid: false; reason: 'INCOMPLETE' | 'CONTRACT_MISMATCH' | 'NOT_APPROVED' | 'AMOUNT_MISMATCH' | 'MODE_MISMATCH' };

export function verifyBillingPaymentEvidence(input: {
  contractId: number;
  providerSubscriptionId: string;
  authorizedPaymentId: string;
  expectedAmount: string;
  authorizedPayment: unknown;
  payment: unknown;
}): BillingPaymentEvidence {
  const authorized = object(input.authorizedPayment);
  const payment = object(input.payment);
  const nestedPayment = object(authorized?.payment);
  if (!authorized || !payment || !nestedPayment || !id(authorized.id) || !id(nestedPayment.id) || !id(payment.id)) return { valid: false, reason: 'INCOMPLETE' };
  if (!Number.isSafeInteger(input.contractId) || input.contractId <= 0 || !input.providerSubscriptionId || id(authorized.id) !== input.authorizedPaymentId || authorized.preapproval_id !== input.providerSubscriptionId || authorized.external_reference !== `LAIXIA-CONTRACT-${input.contractId}` || id(nestedPayment.id) !== id(payment.id)) {
    return { valid: false, reason: 'CONTRACT_MISMATCH' };
  }
  if (payment.live_mode !== false) return { valid: false, reason: 'MODE_MISMATCH' };
  if (authorized.status !== 'processed' || nestedPayment.status !== 'approved' || payment.status !== 'approved' || payment.status_detail !== 'accredited') return { valid: false, reason: 'NOT_APPROVED' };
  const authorizedAmount = amount(authorized.transaction_amount);
  const paymentAmount = amount(payment.transaction_amount);
  const expected = { expectedAmount: input.expectedAmount, expectedCurrency: 'ARS' };
  if (!authorizedAmount || !paymentAmount || !billingAmountMatches({ ...expected, receivedAmount: authorizedAmount, receivedCurrency: String(authorized.currency_id) }) || !billingAmountMatches({ ...expected, receivedAmount: paymentAmount, receivedCurrency: String(payment.currency_id) })) {
    return { valid: false, reason: 'AMOUNT_MISMATCH' };
  }
  const paidAt = typeof payment.date_approved === 'string' ? new Date(payment.date_approved) : null;
  const scheduledAt = typeof authorized.debit_date === 'string' ? new Date(authorized.debit_date) : null;
  if (!paidAt || !scheduledAt || !Number.isFinite(paidAt.getTime()) || !Number.isFinite(scheduledAt.getTime())) return { valid: false, reason: 'INCOMPLETE' };
  return { valid: true, paymentId: id(payment.id)!, paidAt, scheduledAt };
}
