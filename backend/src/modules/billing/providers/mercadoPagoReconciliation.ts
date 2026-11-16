import { billingAmountMatches } from './billingAmount.js';
import { parseMercadoPagoCheckoutResponse } from './mercadoPagoCheckout.js';

export type CheckoutReconciliation =
  | { result: 'RECOVERED'; externalId: string; checkoutUrl: string }
  | { result: 'REVIEW'; reason: 'INCOMPLETE' | 'NOT_FOUND' | 'MULTIPLE' | 'MISMATCH' };

export function reconcilePendingCheckout(input: {
  contractId: number;
  expectedEmail: string;
  expectedAmount: string;
  candidates: unknown[];
  complete: boolean;
}): CheckoutReconciliation {
  if (!input.complete) return { result: 'REVIEW', reason: 'INCOMPLETE' };
  const reference = `LAIXIA-CONTRACT-${input.contractId}`;
  const matches = input.candidates.filter((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) && (candidate as Record<string, unknown>).external_reference === reference);
  if (matches.length === 0) return { result: 'REVIEW', reason: 'NOT_FOUND' };
  if (matches.length !== 1) return { result: 'REVIEW', reason: 'MULTIPLE' };
  const candidate = matches[0] as Record<string, unknown>;
  const recurring = candidate.auto_recurring;
  if (!recurring || typeof recurring !== 'object' || Array.isArray(recurring) || typeof candidate.payer_email !== 'string' || candidate.payer_email.trim().toLowerCase() !== input.expectedEmail.trim().toLowerCase()) {
    return { result: 'REVIEW', reason: 'MISMATCH' };
  }
  const terms = recurring as Record<string, unknown>;
  if ((typeof terms.transaction_amount !== 'string' && typeof terms.transaction_amount !== 'number') || !billingAmountMatches({ expectedAmount: input.expectedAmount, expectedCurrency: 'ARS', receivedAmount: String(terms.transaction_amount), receivedCurrency: String(terms.currency_id) }) || terms.frequency !== 1 || terms.frequency_type !== 'months') {
    return { result: 'REVIEW', reason: 'MISMATCH' };
  }
  try {
    const subscription = parseMercadoPagoCheckoutResponse(candidate);
    return { result: 'RECOVERED', externalId: subscription.externalId, checkoutUrl: subscription.authorizationUrl };
  } catch {
    return { result: 'REVIEW', reason: 'MISMATCH' };
  }
}
