import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomInt, randomUUID } from 'node:crypto';
import pg from 'pg';

async function main(): Promise<void> {
  const direct = new URL(process.env.DIRECT_URL!);
  const runtime = new URL(process.env.DATABASE_URL!);
  if (direct.username !== 'postgres.sowbuvdeampxsbpgtgvo' || runtime.username !== direct.username) throw new Error('Destino de testing inválido');
  process.env.APP_ENV = 'testing';
  process.env.FRONTEND_URL = 'https://testing.example.test';
  process.env.BACKEND_URL = 'https://api.testing.example.test';
  process.env.CORS_ORIGINS = 'https://testing.example.test';
  process.env.BILLING_MP_TEST_ENABLED = 'true';
  process.env.BILLING_MP_TEST_WEBHOOK_ENABLED = 'true';
  process.env.BILLING_MP_TEST_ACCESS_TOKEN = 'token-simulado';
  process.env.BILLING_PAID_ACCESS_TESTING = 'true';
  process.env.BILLING_ENFORCEMENT_TESTING = 'true';
  const { processTestBillingPayment } = await import('../src/modules/billing/billing.paymentProcessor.js');
  const { resolveOwnerBillingStatus } = await import('../src/modules/billing/billing.effective.js');
  const { assertBillingOperation } = await import('../src/modules/billing/billing.guard.js');
  const { prisma } = await import('../src/config/prisma.js');
  const client = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  const tag = randomUUID();
  const authorizedPaymentId = String(randomInt(100_000_000_000, 900_000_000_000));
  const paymentId = String(randomInt(100_000_000_000, 900_000_000_000));
  let userId: number | undefined;
  let accountId: number | undefined;
  let contractId: number | undefined;
  let eventId: number | undefined;
  const hotelIds: number[] = [];
  await client.connect();
  try {
    const periodColumns = await client.query(`SELECT count(*)::int AS total FROM information_schema.columns WHERE table_schema='public' AND table_name='OwnerBillingPeriod' AND column_name IN ('paymentId', 'providerInstallmentId', 'providerScheduledAt')`);
    if (periodColumns.rows[0].total !== 3) throw new Error('Falta aplicar la migración de períodos de prueba');
    const user = await client.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`billing-processor-${tag}@example.test`]);
    userId = user.rows[0].id;
    const account = await client.query('INSERT INTO public."OwnerBillingAccount" ("ownerId", status, "trialStartedAt", "trialEndsAt") VALUES ($1, $2, $3, $4) RETURNING id', [userId, 'TRIALING', '2026-10-01T12:00:00Z', '2026-10-15T12:00:00Z']);
    accountId = account.rows[0].id;
    const hasKey = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='OwnerBillingContract' AND column_name='requestKey'`);
    const subscriptionId = `sub_${tag}`;
    const contract = hasKey.rowCount
      ? await client.query('INSERT INTO public."OwnerBillingContract" ("accountId", provider, "providerSubscriptionId", "requestKey", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, 150, $5, now()) RETURNING id', [accountId, 'MERCADOPAGO', subscriptionId, tag, 'ARS'])
      : await client.query('INSERT INTO public."OwnerBillingContract" ("accountId", provider, "providerSubscriptionId", amount, currency, "updatedAt") VALUES ($1, $2, $3, 150, $4, now()) RETURNING id', [accountId, 'MERCADOPAGO', subscriptionId, 'ARS']);
    contractId = contract.rows[0].id;
    const event = await client.query('INSERT INTO public."OwnerBillingWebhookEvent" (provider, "providerNotificationId", topic, "resourceId") VALUES ($1, $2, $3, $4) RETURNING id', ['MERCADOPAGO', tag, 'subscription_authorized_payment', authorizedPaymentId]);
    eventId = event.rows[0].id;
    const transport: typeof fetch = async (url) => {
      if (url === `https://api.mercadopago.com/authorized_payments/${authorizedPaymentId}`) return new Response(JSON.stringify({ id: authorizedPaymentId, preapproval_id: subscriptionId, external_reference: `LAIXIA-CONTRACT-${contractId}`, status: 'processed', debit_date: '2026-11-14T12:00:00Z', transaction_amount: '150.00', currency_id: 'ARS', payment: { id: paymentId, status: 'approved' } }));
      if (url === `https://api.mercadopago.com/v1/payments/${paymentId}`) return new Response(JSON.stringify({ id: paymentId, status: 'approved', status_detail: 'accredited', transaction_amount: 150, currency_id: 'ARS', live_mode: false, date_approved: '2026-11-14T12:00:00Z' }));
      throw new Error('Consulta inesperada: no se permiten llamadas externas');
    };
    const results = await Promise.all([processTestBillingPayment(eventId!, transport), processTestBillingPayment(eventId!, transport)]);
    assert.ok(results.includes('RECORDED'));
    assert.ok(results.every((result) => result === 'RECORDED' || result === 'DEFERRED'));
    const payments = await client.query('SELECT status, amount::text FROM public."OwnerBillingPayment" WHERE "contractId" = $1', [contractId]);
    assert.equal(payments.rowCount, 1);
    assert.deepEqual(payments.rows[0], { status: 'APPROVED', amount: '150.00' });
    const recorded = await client.query('SELECT status, "lastError" FROM public."OwnerBillingWebhookEvent" WHERE id = $1', [eventId]);
    assert.deepEqual(recorded.rows[0], { status: 'PROCESSED', lastError: null });
    const periods = await client.query(`SELECT to_char("startsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS starts, to_char("endsAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS ends FROM public."OwnerBillingPeriod" WHERE "contractId" = $1`, [contractId]);
    assert.equal(periods.rowCount, 1);
    assert.equal(periods.rows[0].starts, '2026-11-14T12:00:00.000Z');
    assert.equal(periods.rows[0].ends, '2026-12-14T12:00:00.000Z');
    const accountData = await prisma.ownerBillingAccount.findUniqueOrThrow({ where: { id: accountId }, select: { id: true, status: true, trialEndsAt: true } });
    assert.equal((await resolveOwnerBillingStatus(accountData, new Date('2026-11-14T11:59:59Z'))).status, 'EXPIRED');
    assert.equal((await resolveOwnerBillingStatus(accountData, new Date('2026-11-14T12:00:00Z'))).status, 'ACTIVE');
    assert.equal((await resolveOwnerBillingStatus(accountData, new Date('2026-12-14T12:00:00Z'))).status, 'EXPIRED');
    const current = new Date();
    if (current >= new Date('2026-11-14T12:00:00Z') && current < new Date('2026-12-14T12:00:00Z')) {
      for (let n = 0; n < 2; n++) {
        const hotel = await client.query('INSERT INTO public."Company" (name, "createdById", "updatedAt") VALUES ($1, $2, now()) RETURNING id', [`billing-processor-${tag}-${n}`, userId]);
        hotelIds.push(hotel.rows[0].id);
        await client.query('INSERT INTO public."OwnerBillingCoverage" ("accountId", "companyId", covered) VALUES ($1, $2, true)', [accountId, hotel.rows[0].id]);
      }
      await assert.rejects(assertBillingOperation(hotelIds[0]!, 'MODIFICAR_DATOS', 'OWNER'), { code: 'BILLING_HOTEL_SELECTION_REQUIRED' });
      await client.query('UPDATE public."OwnerBillingCoverage" SET covered = false WHERE "companyId" = $1', [hotelIds[1]]);
      await assert.doesNotReject(assertBillingOperation(hotelIds[0]!, 'MODIFICAR_DATOS', 'OWNER'));
      await assert.rejects(assertBillingOperation(hotelIds[1]!, 'MODIFICAR_DATOS', 'OWNER'), { code: 'HOTEL_NOT_COVERED' });
    }
    await client.query('UPDATE public."OwnerBillingPayment" SET status = $1 WHERE "contractId" = $2', ['REFUNDED', contractId]);
    assert.equal((await resolveOwnerBillingStatus(accountData, new Date('2026-11-20T12:00:00Z'))).status, 'EXPIRED');
    console.log('Pago y período registrados una sola vez; acceso activo solo durante el período acreditado.');
  } finally {
    if (contractId) await client.query('DELETE FROM public."OwnerBillingPeriod" WHERE "contractId" = $1', [contractId]);
    if (contractId) await client.query('DELETE FROM public."OwnerBillingPayment" WHERE "contractId" = $1', [contractId]);
    if (eventId) await client.query('DELETE FROM public."OwnerBillingWebhookEvent" WHERE id = $1', [eventId]);
    if (contractId) await client.query('DELETE FROM public."OwnerBillingContract" WHERE id = $1', [contractId]);
    if (hotelIds.length) await client.query('DELETE FROM public."OwnerBillingCoverage" WHERE "companyId" = ANY($1::int[])', [hotelIds]);
    if (hotelIds.length) await client.query('DELETE FROM public."Company" WHERE id = ANY($1::int[])', [hotelIds]);
    if (accountId) await client.query('DELETE FROM public."OwnerBillingAccount" WHERE id = $1', [accountId]);
    if (userId) await client.query('DELETE FROM public."User" WHERE id = $1', [userId]);
    await client.end();
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => { console.error('[billing] Prueba de procesamiento falló', err instanceof Error ? err.message : err); process.exitCode = 1; });
