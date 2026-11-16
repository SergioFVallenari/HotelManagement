import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.BILLING_EXISTING_TEST_URL;

test('checkout no permite dos contratos abiertos para la misma cuenta', { skip: !url }, async () => {
  assert.equal(new URL(url!).username, 'postgres.sowbuvdeampxsbpgtgvo');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const migration = readFileSync('prisma/migrations/20261114150000_billing_checkout_intent/migration.sql', 'utf8').replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
    await client.query(migration);
    const tag = randomUUID();
    const user = await client.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`billing-checkout-${tag}@example.test`]);
    const account = await client.query('INSERT INTO public."OwnerBillingAccount" ("ownerId", status) VALUES ($1, $2) RETURNING id', [user.rows[0].id, 'GRANDFATHERED']);
    const insert = (key: string) => client.query('INSERT INTO public."OwnerBillingContract" ("accountId", provider, "requestKey", amount, currency, "updatedAt") VALUES ($1, $2, $3, $4, $5, now())', [account.rows[0].id, 'MERCADOPAGO', key, '100.00', 'ARS']);
    await insert(randomUUID());
    await client.query('SAVEPOINT duplicate_contract');
    await assert.rejects(insert(randomUUID()), { code: '23505' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_contract');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
