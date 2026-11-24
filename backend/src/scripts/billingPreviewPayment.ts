async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const installmentId = args[0] ?? '';
  if (args.length !== 1 || !/^[1-9]\d{0,199}$/.test(installmentId)) throw new Error('El identificador de cuota no es válido.');
  const { env } = await import('../config/env.js');
  const database = new URL(env.databaseUrl);
  const config = env.billingMpTest;
  if (env.appEnv !== 'testing' || !config.enabled || !config.accessToken || !['postgres:', 'postgresql:'].includes(database.protocol) || database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('La vista previa requiere el proyecto de testing verificado.');
  }
  const { billingTestAccountPolicy } = await import('../modules/billing/billing.testAccountPolicy.js');
  const configuredAccounts = billingTestAccountPolicy();
  const { prisma } = await import('../config/prisma.js');
  try {
    const { verifyConfiguredTestBillingPayment } = await import('../modules/billing/providers/billingVerification.js');
    const { readMercadoPagoBillingResource } = await import('../modules/billing/providers/mercadoPagoRead.js');
    const { readMercadoPagoBillingIdentity } = await import('../modules/billing/providers/mercadoPagoIdentity.js');
    const options = { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport: fetch };
    const result = await verifyConfiguredTestBillingPayment(installmentId, {
      configuredAccounts,
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, options),
      readIdentity: (id) => readMercadoPagoBillingIdentity(id, options),
      findContract: async (providerSubscriptionId) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { provider_providerSubscriptionId: { provider: 'MERCADOPAGO', providerSubscriptionId } }, select: { id: true, provider: true, providerSubscriptionId: true, status: true, amount: true, currency: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
    });
    if (result.result === 'REVIEW') {
      console.log(JSON.stringify(result));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ result: 'VERIFIED_NOT_APPLIED', contractId: result.contractId, installmentId: result.installmentId, paymentId: result.paymentId, amount: result.amount, currency: result.currency, paidAt: result.paidAt, scheduledAt: result.scheduledAt, testIdentitySource: configuredAccounts ? 'OPERATOR_CONFIGURATION' : 'STRICT_TEST_MODE' }));
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('[billing] No se pudo verificar la cuota de testing. Revisá la configuración y la evidencia. Uso: billing:preview-payment <authorizedPaymentId>');
  process.exitCode = 1;
});
