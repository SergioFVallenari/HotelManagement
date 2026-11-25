import { parsePaymentRecoveryArgs, recoverConfiguredTestPayment } from '../modules/billing/providers/billingPaymentRecovery.js';

async function main(): Promise<void> {
  const input = parsePaymentRecoveryArgs(process.argv.slice(2));
  const { env } = await import('../config/env.js');
  const { billingTestAccountPolicy } = await import('../modules/billing/billing.testAccountPolicy.js');
  if (!billingTestAccountPolicy() || !env.billingMpTest.accessToken) throw new Error('La recuperación de testing no está configurada.');
  const { prisma } = await import('../config/prisma.js');
  try {
    const { readMercadoPagoBillingResource } = await import('../modules/billing/providers/mercadoPagoRead.js');
    const { readMercadoPagoBillingIdentity } = await import('../modules/billing/providers/mercadoPagoIdentity.js');
    const { recordTestBillingPayment } = await import('../modules/billing/billing.paymentPersistence.js');
    const options = { enabled: env.billingMpTest.enabled, environment: env.appEnv, accessToken: env.billingMpTest.accessToken, transport: fetch };
    const result = await recoverConfiguredTestPayment(input, {
      config: { ...env.billingMpTest.configuredAccounts, billingEnabled: env.billingMpTest.enabled, environment: env.appEnv, databaseUrl: env.databaseUrl },
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, options),
      readIdentity: (id) => readMercadoPagoBillingIdentity(id, options),
      findContract: async (providerSubscriptionId) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { provider_providerSubscriptionId: { provider: 'MERCADOPAGO', providerSubscriptionId } }, select: { id: true, provider: true, providerSubscriptionId: true, status: true, amount: true, currency: true, intervalMonths: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
      record: (payment) => recordTestBillingPayment(payment),
    });
    console.log(JSON.stringify(result));
    if (result.result === 'REVIEW') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_RECOVERY_FAILED';
  console.error('[billing]', code);
  console.error('[billing] No se pudo recuperar el pago de testing. Revisá configuración, evidencia y conflictos. Uso: billing:recover-payment <contractId> <installmentId> <paymentId> [--apply]');
  process.exitCode = 1;
});
