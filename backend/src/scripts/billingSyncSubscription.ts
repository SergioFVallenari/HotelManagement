import { assertSubscriptionSyncConfig, parseSubscriptionSyncArgs, syncTestSubscription } from '../modules/billing/providers/billingSubscriptionSync.js';

async function main(): Promise<void> {
  const input = parseSubscriptionSyncArgs(process.argv.slice(2));
  const { env } = await import('../config/env.js');
  const config = { environment: env.appEnv, databaseUrl: env.databaseUrl, enabled: env.billingMpTest.enabled };
  assertSubscriptionSyncConfig(config);
  if (!env.billingMpTest.accessToken) throw new Error('La credencial de testing no está configurada.');
  const { prisma } = await import('../config/prisma.js');
  try {
    const { readMercadoPagoBillingResource } = await import('../modules/billing/providers/mercadoPagoRead.js');
    const { readMercadoPagoBillingIdentity } = await import('../modules/billing/providers/mercadoPagoIdentity.js');
    const { recordTestSubscriptionState } = await import('../modules/billing/billing.subscriptionPersistence.js');
    const options = { enabled: env.billingMpTest.enabled, environment: env.appEnv, accessToken: env.billingMpTest.accessToken, transport: fetch };
    const result = await syncTestSubscription(input, {
      config, now: new Date(),
      findContract: async (id) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { id }, select: { id: true, provider: true, providerSubscriptionId: true, status: true, amount: true, currency: true, intervalMonths: true, providerUpdatedAt: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
      readSubscription: (id) => readMercadoPagoBillingResource('subscription', id, options),
      readIdentity: () => readMercadoPagoBillingIdentity('me', options),
      record: (subscription) => recordTestSubscriptionState(subscription),
    });
    console.log(JSON.stringify(result));
    if (result.result === 'REVIEW') process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && /^BILLING_[A-Z_]+$/.test(error.code) ? error.code : 'BILLING_SUBSCRIPTION_SYNC_FAILED';
  console.error('[billing]', code);
  console.error('[billing] No se pudo sincronizar el contrato de testing. Revisá configuración, migraciones y evidencia. Uso: billing:sync-subscription <contractId> [--apply]');
  process.exitCode = 1;
});
