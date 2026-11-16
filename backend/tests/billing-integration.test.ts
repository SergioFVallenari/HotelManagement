import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.BILLING_TEST_DATABASE_URL;

test('migración de billing: backfill, trial, idempotencia y rollback', { skip: !url }, async () => {
  const database = decodeURIComponent(new URL(url!).pathname.slice(1));
  assert.ok(database.endsWith('_billing_test'), 'La base dedicada debe terminar en _billing_test');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL search_path = public');
    const existing = await client.query(`SELECT to_regclass('public."Company"') AS company`);
    assert.equal(existing.rows[0].company, null, 'La base de pruebas debe estar vacía');
    await client.query('CREATE TABLE public."Company" (id integer PRIMARY KEY)');
    await client.query('INSERT INTO public."Company" (id) VALUES (1)');
    const migration = readFileSync('prisma/migrations/20261112120000_billing_trial_foundation/migration.sql', 'utf8')
      .replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
    await client.query(migration);
    await client.query('INSERT INTO public."Company" (id) VALUES (2)');
    await client.query('SELECT public.provision_company_billing(2, false)');
    const rows = await client.query(`
      SELECT a."companyId", s.status, s."trialStartedAt", s."trialEndsAt",
             (SELECT count(*)::int FROM public."BillingSubscriptionEvent" e WHERE e."subscriptionId" = s.id) AS events,
             (SELECT count(*)::int FROM public."BillingSubscriptionItem" i WHERE i."subscriptionId" = s.id) AS items
      FROM public."BillingAccount" a JOIN public."BillingSubscription" s ON s."accountId" = a.id
      ORDER BY a."companyId"
    `);
    assert.equal(rows.rowCount, 2);
    assert.equal(rows.rows[0].status, 'GRANDFATHERED');
    assert.equal(rows.rows[0].trialEndsAt, null);
    assert.equal(rows.rows[1].status, 'TRIALING');
    assert.equal(rows.rows[1].trialEndsAt.getTime() - rows.rows[1].trialStartedAt.getTime(), 14 * 86_400_000);
    assert.equal(rows.rows[1].events, 1);
    assert.equal(rows.rows[1].items, 1);
    await client.query('SAVEPOINT new_company');
    await client.query('INSERT INTO public."Company" (id) VALUES (3)');
    await client.query('ROLLBACK TO SAVEPOINT new_company');
    const rolledBack = await client.query('SELECT count(*)::int AS count FROM public."BillingAccount" WHERE "companyId" = 3');
    assert.equal(rolledBack.rows[0].count, 0);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
