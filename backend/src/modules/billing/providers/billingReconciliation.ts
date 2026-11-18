import { verifyDeclaredTestAuthorizedBillingPayment, type BillingContractForVerification, type VerifiedBillingResult } from './billingVerification.js';
import { parsePaymentInspectionArgs } from './billingInspectionInput.js';
import type { DeclaredTestAccounts } from './billingTestAccounts.js';
import type { BillingReadResource } from './mercadoPagoRead.js';
import type { RecordedTestBillingPayment } from '../billing.paymentPersistence.js';

export interface TestReconciliationInput {
  contractId: number;
  installmentId: string;
  paymentId: string;
  declared: DeclaredTestAccounts;
  apply: boolean;
}

interface ReconciliationEnvironment {
  environment: string;
  databaseUrl: string;
  enabled: boolean;
  paidAccessEnabled: boolean;
}

export function parseTestReconciliationArgs(args: readonly string[]): TestReconciliationInput {
  const apply = args.at(-1) === '--apply';
  const values = apply ? args.slice(0, -1) : args;
  if (values.length !== 5 || !/^[1-9]\d*$/.test(values[0]) || !/^[1-9]\d{0,199}$/.test(values[1])) throw new Error('Los argumentos de conciliación no son válidos.');
  const contractId = Number(values[0]);
  if (!Number.isSafeInteger(contractId)) throw new Error('El contrato no es válido.');
  const { paymentId, declared } = parsePaymentInspectionArgs(values.slice(2));
  return { contractId, installmentId: values[1], paymentId, declared: declared!, apply };
}

export function assertTestReconciliationEnvironment(config: ReconciliationEnvironment, apply: boolean): void {
  const database = new URL(config.databaseUrl);
  if (config.environment !== 'testing' || !config.enabled || database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('La conciliación solo admite el proyecto de testing verificado.');
  }
  if (apply && config.paidAccessEnabled) throw new Error('Desactivá el acceso pago experimental antes de aplicar la conciliación.');
}

export async function reconcileDeclaredTestPayment(input: TestReconciliationInput, dependencies: {
  config: ReconciliationEnvironment;
  read: (resource: BillingReadResource, id: string) => Promise<unknown>;
  readIdentity: (id: string) => Promise<unknown>;
  findContract: (subscriptionId: string) => Promise<(BillingContractForVerification & { intervalMonths: number }) | null>;
  record: (verified: Extract<VerifiedBillingResult, { result: 'VERIFIED' }>) => Promise<RecordedTestBillingPayment>;
}) {
  assertTestReconciliationEnvironment(dependencies.config, input.apply);
  const verified = await verifyDeclaredTestAuthorizedBillingPayment(input.installmentId, {
    read: dependencies.read,
    readIdentity: dependencies.readIdentity,
    declared: input.declared,
    findContract: async (subscriptionId) => {
      const contract = await dependencies.findContract(subscriptionId);
      return contract?.id === input.contractId && contract.intervalMonths === 1 ? contract : null;
    },
  });
  if (verified.result !== 'VERIFIED') return verified;
  if (verified.paymentId !== input.paymentId) return { result: 'REVIEW' as const, reason: 'EXPECTED_PAYMENT_MISMATCH' };
  const summary = { contractId: verified.contractId, installmentId: verified.installmentId, paymentId: verified.paymentId, paidAt: verified.paidAt, scheduledAt: verified.scheduledAt, amount: verified.amount, currency: verified.currency, testIdentitySource: 'OPERATOR_DECLARATION' as const };
  if (!input.apply) return { result: 'VERIFIED_NOT_APPLIED' as const, ...summary };
  const recorded = await dependencies.record(verified);
  return { ...summary, ...recorded };
}
