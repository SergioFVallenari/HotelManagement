import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.BILLING_EXISTING_TEST_URL;

test('persistencia de cobros: snapshots, claves únicas y rollback', { skip: !url }, async () => {
  const connection = new URL(url!);
  assert.equal(connection.username, 'postgres.sowbuvdeampxsbpgtgvo', 'La conexión no apunta al proyecto de testing');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query('SELECT to_regclass($1) AS name', ['public."OwnerBillingContract"']);
    if (!existing.rows[0].name) {
      const migration = readFileSync('prisma/migrations/20261114120000_owner_billing_payments/migration.sql', 'utf8')
        .replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
      await client.query(migration);
    }
    const tag = randomUUID();
    const user = await client.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`billing-payment-${tag}@example.test`]);
    const account = await client.query('INSERT INTO public."OwnerBillingAccount" ("ownerId", status) VALUES ($1, $2) RETURNING id', [user.rows[0].id, 'GRANDFATHERED']);
    const hasRequestKey = await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'OwnerBillingContract' AND column_name = 'requestKey'`);
    const contract = hasRequestKey.rowCount
      ? await client.query('INSERT INTO public."OwnerBillingContract" ("accountId", provider, "providerSubscriptionId", "requestKey", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id', [account.rows[0].id, 'MERCADOPAGO', tag, tag, '12345.67', 'ARS'])
      : await client.query('INSERT INTO public."OwnerBillingContract" ("accountId", provider, "providerSubscriptionId", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, $5, now()) RETURNING id', [account.rows[0].id, 'MERCADOPAGO', tag, '12345.67', 'ARS']);
    const contractId = contract.rows[0].id;
    await client.query('INSERT INTO public."OwnerBillingPeriod" ("contractId", "startsAt", "endsAt", amount, currency) VALUES ($1, $2, $3, $4, $5)', [contractId, '2026-11-01', '2026-12-01', '12345.67', 'ARS']);
    await client.query('INSERT INTO public."OwnerBillingPayment" ("contractId", provider, "providerPaymentId", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [contractId, 'MERCADOPAGO', tag, '12345.67', 'ARS']);
    await client.query('INSERT INTO public."OwnerBillingWebhookEvent" (provider, "providerNotificationId", topic, "resourceId") VALUES ($1, $2, $3, $4)', ['MERCADOPAGO', tag, 'payment', tag]);
    await client.query('SAVEPOINT duplicate_payment');
    await assert.rejects(client.query('INSERT INTO public."OwnerBillingPayment" ("contractId", provider, "providerPaymentId", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [contractId, 'MERCADOPAGO', tag, '12345.67', 'ARS']), { code: '23505' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_payment');
    await client.query('SAVEPOINT invalid_period');
    await assert.rejects(client.query('INSERT INTO public."OwnerBillingPeriod" ("contractId", "startsAt", "endsAt", amount, currency) VALUES ($1, $2, $3, $4, $5)', [contractId, '2026-12-01', '2026-11-01', '12345.67', 'ARS']), { code: '23514' });
    await client.query('ROLLBACK TO SAVEPOINT invalid_period');
    const snapshot = await client.query('SELECT amount::text, currency FROM public."OwnerBillingPeriod" WHERE "contractId" = $1', [contractId]);
    assert.deepEqual(snapshot.rows[0], { amount: '12345.67', currency: 'ARS' });
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
