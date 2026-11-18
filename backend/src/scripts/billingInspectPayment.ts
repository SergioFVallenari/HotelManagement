import { parsePaymentInspectionArgs } from '../modules/billing/providers/billingInspectionInput.js';

async function main(): Promise<void> {
  const { paymentId, declared } = parsePaymentInspectionArgs(process.argv.slice(2));
  const { env } = await import('../config/env.js');
  const config = env.billingMpTest;
  if (env.appEnv !== 'testing' || !config.enabled || !config.accessToken) throw new Error('La consulta de prueba no está habilitada.');
  const database = new URL(env.databaseUrl);
  if (database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('La consulta solo admite el pooler del proyecto de testing.');
  }
  const { prisma } = await import('../config/prisma.js');
  try {
    const { inspectBillingPayment } = await import('../modules/billing/providers/billingPaymentInspection.js');
    const { readMercadoPagoBillingResource } = await import('../modules/billing/providers/mercadoPagoRead.js');
    const { readMercadoPagoBillingIdentity } = await import('../modules/billing/providers/mercadoPagoIdentity.js');
    const { verifyBillingTestAccounts } = await import('../modules/billing/providers/billingTestAccounts.js');
    const options = { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport: fetch };
    const result = await inspectBillingPayment(paymentId, {
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, options),
      verifyTestAccounts: (payment) => verifyBillingTestAccounts(payment, (id) => readMercadoPagoBillingIdentity(id, options), declared),
      findContract: async (id) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { id }, select: { id: true, provider: true, providerSubscriptionId: true, amount: true, currency: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
    });
    console.log(JSON.stringify({ ...result, ...(declared ? { testIdentitySource: 'OPERATOR_DECLARATION' } : {}) }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('[billing] No se pudo inspeccionar el pago. Revisá la configuración de testing, los IDs y la disponibilidad del proveedor. Uso: pnpm billing:inspect-payment <paymentId> [sellerTestUserId buyerTestUserId]');
  process.exitCode = 1;
});
