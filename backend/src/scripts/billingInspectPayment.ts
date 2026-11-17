async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const paymentId = args[0] ?? '';
  if (args.length !== 1 || !/^[1-9]\d{0,199}$/.test(paymentId)) throw new Error('El ID de pago no es válido.');
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
    const result = await inspectBillingPayment(paymentId, {
      read: (resource, id) => readMercadoPagoBillingResource(resource, id, { enabled: config.enabled, environment: env.appEnv, accessToken: config.accessToken, transport: fetch }),
      findContract: async (id) => {
        const contract = await prisma.ownerBillingContract.findUnique({ where: { id }, select: { id: true, provider: true, providerSubscriptionId: true, amount: true, currency: true } });
        return contract ? { ...contract, amount: contract.amount.toFixed(2) } : null;
      },
    });
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('[billing] No se pudo inspeccionar el pago. Revisá la configuración de testing, el ID y la disponibilidad del proveedor. Uso: pnpm billing:inspect-payment <paymentId>');
  process.exitCode = 1;
});
