async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--apply')) throw new Error('Uso: billing:retry-events [--apply]');
  const apply = args[0] === '--apply';
  const { env } = await import('../config/env.js');
  const config = env.billingMpTest;
  const database = new URL(env.databaseUrl);
  if (env.appEnv !== 'testing' || !config.enabled || !config.webhookEnabled || !config.accessToken || database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com')) {
    throw new Error('El reprocesamiento requiere el proyecto de testing y el procesador de prueba habilitado.');
  }
  const { prisma } = await import('../config/prisma.js');
  try {
    const { BILLING_BATCH_SIZE, BILLING_MAX_ATTEMPTS, BILLING_PROCESSABLE_TOPICS, billingRetryWhere, runBillingRetryBatch } = await import('../modules/billing/billing.retry.js');
    const now = new Date();
    const [events, exhausted, unsupported] = await Promise.all([
      prisma.ownerBillingWebhookEvent.findMany({ where: billingRetryWhere(now), orderBy: [{ nextAttemptAt: 'asc' }, { id: 'asc' }], take: BILLING_BATCH_SIZE, select: { id: true } }),
      prisma.ownerBillingWebhookEvent.count({ where: { provider: 'MERCADOPAGO', topic: { in: BILLING_PROCESSABLE_TOPICS }, status: { not: 'PROCESSED' }, attempts: { gte: BILLING_MAX_ATTEMPTS } } }),
      prisma.ownerBillingWebhookEvent.count({ where: { provider: 'MERCADOPAGO', topic: { notIn: BILLING_PROCESSABLE_TOPICS }, status: { not: 'PROCESSED' } } }),
    ]);
    if (!apply) {
      console.log(JSON.stringify({ result: 'PREVIEW', selected: events.length, exhausted, unsupported }));
      return;
    }
    const { processTestBillingEvent } = await import('../modules/billing/billing.eventProcessor.js');
    const summary = await runBillingRetryBatch(events.map((event) => event.id), processTestBillingEvent);
    console.log(JSON.stringify({ result: 'BATCH_COMPLETED', ...summary, exhausted, unsupported }));
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(() => {
  console.error('[billing] No se pudo reprocesar el lote de testing. Revisá configuración, migraciones y eventos pendientes. Uso: billing:retry-events [--apply]');
  process.exitCode = 1;
});
