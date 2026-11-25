import { configuredBillingTestAccounts, type BillingTestAccountPolicyConfig } from './billingTestAccountPolicy.js';
import { verifyConfiguredTestBillingPayment, type BillingContractForVerification } from './billingVerification.js';
import type { BillingReadResource } from './mercadoPagoRead.js';
import type { RecordedTestBillingPayment, VerifiedTestBillingPayment } from '../billing.paymentPersistence.js';

export interface PaymentRecoveryInput {
  contractId: number;
  installmentId: string;
  paymentId: string;
  apply: boolean;
}

export function parsePaymentRecoveryArgs(args: readonly string[]): PaymentRecoveryInput {
  const apply = args.at(-1) === '--apply';
  const values = apply ? args.slice(0, -1) : args;
  if (values.length !== 3 || !values.every(value => /^[1-9]\d{0,199}$/.test(value)) || !Number.isSafeInteger(Number(values[0]))) {
    throw new Error('Uso: billing:recover-payment <contractId> <installmentId> <paymentId> [--apply]');
  }
  return { contractId: Number(values[0]), installmentId: values[1], paymentId: values[2], apply };
}

export async function recoverConfiguredTestPayment(input: PaymentRecoveryInput, dependencies: {
  config: BillingTestAccountPolicyConfig;
  read: (resource: BillingReadResource, id: string) => Promise<unknown>;
  readIdentity: (id: string) => Promise<unknown>;
  findContract: (subscriptionId: string) => Promise<(BillingContractForVerification & { intervalMonths: number }) | null>;
  record: (payment: VerifiedTestBillingPayment) => Promise<RecordedTestBillingPayment>;
}) {
  const accounts = configuredBillingTestAccounts(dependencies.config);
  if (!accounts) throw new Error('La recuperación requiere cuentas de prueba configuradas y habilitadas.');
  parsePaymentRecoveryArgs([String(input.contractId), input.installmentId, input.paymentId]);
  if (typeof input.apply !== 'boolean') throw new Error('La opción de aplicación no es válida.');
  const verified = await verifyConfiguredTestBillingPayment(input.installmentId, {
    configuredAccounts: accounts,
    read: dependencies.read,
    readIdentity: dependencies.readIdentity,
    findContract: async (subscriptionId) => {
      const contract = await dependencies.findContract(subscriptionId);
      return contract?.id === input.contractId && contract.intervalMonths === 1 ? contract : null;
    },
  });
  if (verified.result === 'REVIEW') return verified;
  if (verified.paymentId !== input.paymentId) return { result: 'REVIEW' as const, reason: 'EXPECTED_PAYMENT_MISMATCH' };
  const summary = { contractId: verified.contractId, installmentId: verified.installmentId, paymentId: verified.paymentId, amount: verified.amount, currency: verified.currency, paidAt: verified.paidAt, scheduledAt: verified.scheduledAt, testIdentitySource: 'OPERATOR_CONFIGURATION' as const };
  if (!input.apply) return { result: 'VERIFIED_NOT_APPLIED' as const, ...summary };
  return { ...summary, ...await dependencies.record(verified) };
}
