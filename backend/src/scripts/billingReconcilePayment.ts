import { assertTestReconciliationEnvironment, parseTestReconciliationArgs, reconcileDeclaredTestPayment } from '../modules/billing/providers/billingReconciliation.js';

async function main(): Promise<void> {
  const input = parseTestReconciliationArgs(process.argv.slice(2));
  const { env } = await import('../config/env.js');
  const config = { environment: env.appEnv, databaseUrl: env.databaseUrl, enabled: env.billingMpTest.enabled, paidAccessEnabled: env.billingPaidAccessTesting };
  assertTestReconciliationEnvironment(config, input.apply);
  if (!env.billingMpTest.accessToken) throw new Error('La credencial de testing no está configurada.');
  const { prisma } = await import('../config/prisma.js');
  try {
    const { readMercadoPagoBillingResource } = await import('../modules/billing/providers/mercadoPagoRead.js');
    const { readMercadoPagoBillingIdentity } = await import('../modules/billing/providers/mercadoPagoIdentity.js');
    const { recordTestBillingPayment } = await import('../modules/billing/billing.paymentPersistence.js');
    const options = { enabled: env.billingMpTest.enabled, environment: env.appEnv, accessToken: env.billingMpTest.accessToken, transport: fetch };
    const result = await reconcileDeclaredTestPayment(input, {
      config,
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, options),
      readIdentity: (id) => readMercadoPagoBillingIdentity(id, options),
      findContract: async (providerSubscriptionId) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { provider_providerSubscriptionId: { provider: 'MERCADOPAGO', providerSubscriptionId } }, select: { id: true, provider: true, providerSubscriptionId: true, status: true, amount: true, currency: true, intervalMonths: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
      record: recordTestBillingPayment,
    });
    console.log(JSON.stringify(result));
    if (result.result === 'REVIEW') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_RECONCILIATION_FAILED';
  console.error('[billing]', code);
  console.error('[billing] No se pudo conciliar el pago de prueba. Revisá configuración, evidencia y conflictos antes de volver a intentar. Uso: pnpm billing:reconcile-payment <contractId> <installmentId> <paymentId> <sellerTestUserId> <buyerTestUserId> [--apply]');
  process.exitCode = 1;
});
