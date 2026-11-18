import type { DeclaredTestAccounts } from './billingTestAccounts.js';

export function parsePaymentInspectionArgs(args: readonly string[]): { paymentId: string; declared?: DeclaredTestAccounts } {
  const validId = (value: string) => /^[1-9]\d{0,199}$/.test(value);
  if ((args.length !== 1 && args.length !== 3) || !args.every(validId)) {
    throw new Error('Uso: billing:inspect-payment <paymentId> [sellerTestUserId buyerTestUserId]');
  }
  if (args.length === 1) return { paymentId: args[0] };
  if (args[1] === args[2]) throw new Error('Las cuentas de vendedor y comprador deben ser distintas.');
  return { paymentId: args[0], declared: { sellerId: args[1], buyerId: args[2] } };
}
