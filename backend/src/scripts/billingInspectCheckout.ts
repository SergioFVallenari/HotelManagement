async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const ownerId = Number(args[0]);
  if (args.length !== 1 || !/^[1-9]\d*$/.test(args[0] ?? '') || !Number.isSafeInteger(ownerId)) {
    throw new Error('Uso: pnpm billing:inspect-checkout <ownerId>');
  }
  const { env } = await import('../config/env.js');
  if (env.appEnv !== 'testing' || !env.billingMpTest.enabled || !env.billingMpTest.accessToken) {
    throw new Error('La inspección requiere testing y la consulta de billing de prueba habilitada.');
  }
  const database = new URL(env.databaseUrl);
  if (database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('La inspección solo admite el pooler del proyecto de testing verificado.');
  }
  const { prisma } = await import('../config/prisma.js');
  try {
    const { inspectTestPendingCheckout } = await import('../modules/billing/billing.checkoutInspection.js');
    const result = await inspectTestPendingCheckout(ownerId);
    console.log(JSON.stringify(result));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('[billing] No se pudo completar la inspección. Revisá el ownerId, la configuración de testing y la disponibilidad del proveedor. Uso: pnpm billing:inspect-checkout <ownerId>');
  process.exitCode = 1;
});
