import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const url = process.env.BILLING_EXISTING_TEST_URL;

test('billing de propietario: un trial para varios hoteles y rollback', { skip: !url }, async () => {
  const connection = new URL(url!);
  assert.equal(connection.username, 'postgres.sowbuvdeampxsbpgtgvo', 'La conexión no apunta al proyecto de testing');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    if (process.env.BILLING_SIMULATE_MIGRATION === '1') {
      const sql = readFileSync('prisma/migrations/20261113120000_owner_billing/migration.sql', 'utf8')
        .replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
      await client.query(sql);
    }
    const tag = randomUUID();
    const user = await client.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`billing-${tag}@example.test`]);
    const ownerId = user.rows[0].id;
    const type = await client.query('SELECT id FROM public."UserType" WHERE role = $1', ['OWNER']);
    assert.equal(type.rowCount, 1);
    for (let n = 0; n < 4; n++) {
      const company = await client.query('INSERT INTO public."Company" (name, "createdById", "updatedAt") VALUES ($1, $2, now()) RETURNING id', [`billing-${tag}-${n}`, ownerId]);
      await client.query('INSERT INTO public."UserCompany" ("userId", "companyId", username, "typeId", "updatedAt") VALUES ($1, $2, $3, $4, now())', [ownerId, company.rows[0].id, 'billing-test', type.rows[0].id]);
    }
    const accounts = await client.query('SELECT id, status, "trialStartedAt", "trialEndsAt" FROM public."OwnerBillingAccount" WHERE "ownerId" = $1', [ownerId]);
    assert.equal(accounts.rowCount, 1);
    assert.equal(accounts.rows[0].status, 'TRIALING');
    assert.equal(accounts.rows[0].trialEndsAt.getTime() - accounts.rows[0].trialStartedAt.getTime(), 14 * 86_400_000);
    const hotels = await client.query('SELECT covered FROM public."OwnerBillingCoverage" WHERE "accountId" = $1 ORDER BY id', [accounts.rows[0].id]);
    assert.deepEqual(hotels.rows.map((hotel) => hotel.covered), [true, true, true, false]);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('confirmación de Supabase crea propietario, hotel y trial compartido', { skip: !url }, async () => {
  const connection = new URL(url!);
  assert.equal(connection.username, 'postgres.sowbuvdeampxsbpgtgvo', 'La conexión no apunta al proyecto de testing');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    const meta = { username: `test-${id}`, hotel_name: `billing-${id}`, name: 'Prueba' };
    await client.query('INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3::jsonb)', [id, `billing-${id}@example.test`, JSON.stringify(meta)]);
    const before = await client.query('SELECT count(*)::int AS count FROM public."User" WHERE "authUserId" = $1', [id]);
    assert.equal(before.rows[0].count, 0);
    await client.query('UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1', [id]);
    const result = await client.query(`
      SELECT u.id AS owner, c.id AS hotel, c."createdById", a.status, a."trialStartedAt", a."trialEndsAt", cv.covered
      FROM public."User" u
      JOIN public."UserCompany" uc ON uc."userId" = u.id
      JOIN public."Company" c ON c.id = uc."companyId"
      JOIN public."OwnerBillingAccount" a ON a."ownerId" = u.id
      JOIN public."OwnerBillingCoverage" cv ON cv."companyId" = c.id AND cv."accountId" = a.id
      WHERE u."authUserId" = $1
    `, [id]);
    assert.equal(result.rowCount, 1);
    const row = result.rows[0];
    assert.equal(row.owner, row.createdById);
    assert.equal(row.status, 'TRIALING');
    assert.equal(row.covered, true);
    assert.equal(row.trialEndsAt.getTime() - row.trialStartedAt.getTime(), 14 * 86_400_000);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});

test('límite experimental de usuarios en PostgreSQL', { skip: !url }, async () => {
  const connection = new URL(url!);
  assert.equal(connection.username, 'postgres.sowbuvdeampxsbpgtgvo', 'La conexión no apunta al proyecto de testing');
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query('BEGIN');
    const migration = readFileSync('prisma/migrations/20261113140000_user_limit_observer/migration.sql', 'utf8')
      .replace(/^BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
    await client.query(migration);
    await client.query('UPDATE public."BillingLimitControl" SET "userLimitEnabled" = true WHERE id = 1');
    const roles = await client.query('SELECT id, role FROM public."UserType" WHERE role IN ($1, $2)', ['OWNER', 'RECEPCIONISTA']);
    const ownerType = roles.rows.find((row) => row.role === 'OWNER');
    const employeeType = roles.rows.find((row) => row.role === 'RECEPCIONISTA');
    assert.ok(ownerType && employeeType);
    const tag = randomUUID();
    const userIds: number[] = [];
    for (let n = 0; n < 4; n++) {
      const user = await client.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`limit-${tag}-${n}@example.test`]);
      userIds.push(user.rows[0].id);
    }
    const hotel = await client.query('INSERT INTO public."Company" (name, "createdById", "updatedAt") VALUES ($1, $2, now()) RETURNING id', [`limit-${tag}`, userIds[0]]);
    const addMember = (index: number, active: boolean) => client.query(
      'INSERT INTO public."UserCompany" ("userId", "companyId", username, "typeId", "isActive", "updatedAt") VALUES ($1, $2, $3, $4, $5, now())',
      [userIds[index], hotel.rows[0].id, `member-${index}`, index === 0 ? ownerType.id : employeeType.id, active],
    );
    await addMember(0, true);
    await addMember(1, true);
    await addMember(2, true);
    await client.query('SAVEPOINT limit_check');
    await assert.rejects(addMember(3, true), /USER_LIMIT_REACHED/);
    await client.query('ROLLBACK TO SAVEPOINT limit_check');
    await addMember(3, false);
    await client.query('SAVEPOINT activation_check');
    await assert.rejects(client.query('UPDATE public."UserCompany" SET "isActive" = true WHERE "userId" = $1 AND "companyId" = $2', [userIds[3], hotel.rows[0].id]), /USER_LIMIT_REACHED/);
    await client.query('ROLLBACK TO SAVEPOINT activation_check');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
