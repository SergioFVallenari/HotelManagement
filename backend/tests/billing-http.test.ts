import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const enabled = process.env.BILLING_HTTP_TEST === '1';

test('billing HTTP aísla la empresa activa y exige OWNER', { skip: !enabled }, async () => {
  const connection = new URL(process.env.DATABASE_URL!);
  assert.equal(connection.username, 'postgres.sowbuvdeampxsbpgtgvo', 'La conexión no apunta al proyecto de testing');
  assert.ok(process.env.JWT_SECRET, 'Falta JWT_SECRET');
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  let server: ReturnType<ReturnType<typeof import('../src/app.js').createApp>['listen']> | undefined;
  try {
    const companies = await client.query(`
      SELECT a."companyId", a.covered, s."ownerId", s.status, s."trialEndsAt"
      FROM public."OwnerBillingCoverage" a JOIN public."OwnerBillingAccount" s ON s.id = a."accountId"
      WHERE s.status IN ('GRANDFATHERED', 'TRIALING')
      ORDER BY a."companyId"
    `);
    const grandfathered = companies.rows.find((row) => row.status === 'GRANDFATHERED');
    const trial = companies.rows.find((row) => row.status === 'TRIALING');
    assert.ok(grandfathered && trial, 'Se necesita una empresa grandfathered y una con trial en testing');

    const { createApp } = await import('../src/app.js');
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/billing/subscription`;
    const token = (companyId: number, role: string, userId = 1): string => jwt.sign({
      id: userId, companyId, role, username: 'test', name: 'Test', email: 'test@example.test',
    }, process.env.JWT_SECRET!);
    const request = (companyId: number, role: string, query = '') => fetch(`${base}${query}`, {
      headers: { cookie: `gh_token=${token(companyId, role)}` },
    });

    const first = await request(trial.companyId, 'OWNER', `?companyId=${grandfathered.companyId}`);
    assert.equal(first.status, 200);
    assert.equal((await first.json() as { data: { status: string } }).data.status, trial.trialEndsAt.getTime() > Date.now() ? 'TRIALING' : 'EXPIRED');
    const second = await request(grandfathered.companyId, 'OWNER', `?companyId=${trial.companyId}`);
    assert.equal(second.status, 200);
    assert.equal((await second.json() as { data: { status: string } }).data.status, 'GRANDFATHERED');
    const forbidden = await request(trial.companyId, 'RECEPCIONISTA');
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json() as { error: { code: string } }).error.code, 'FORBIDDEN');
    const anonymous = await fetch(base);
    assert.equal(anonymous.status, 401);
    const coverageUrl = `http://127.0.0.1:${address.port}/api/billing/coverage`;
    const cookie = `gh_token=${token(trial.companyId, 'OWNER', trial.ownerId)}`;
    const coverage = await fetch(coverageUrl, { headers: { cookie } });
    assert.equal(coverage.status, 200);
    const body = await coverage.json() as { data: { hotels: Array<{ id: number; activeRooms: number; activeUsers: number }> } };
    assert.ok(body.data.hotels.some((hotel) => hotel.id === trial.companyId));
    assert.ok(!body.data.hotels.some((hotel) => hotel.id === grandfathered.companyId));
    for (const hotel of body.data.hotels) {
      const counts = await client.query('SELECT (SELECT count(*)::int FROM public."Room" WHERE "companyId" = $1 AND "isActive") AS rooms, (SELECT count(*)::int FROM public."UserCompany" WHERE "companyId" = $1 AND "isActive") AS users', [hotel.id]);
      assert.equal(hotel.activeRooms, counts.rows[0].rooms);
      assert.equal(hotel.activeUsers, counts.rows[0].users);
    }
    const foreign = await fetch(coverageUrl, { method: 'PUT', headers: { cookie, 'content-type': 'application/json', 'X-GH-CSRF': '1' }, body: JSON.stringify({ companyIds: [grandfathered.companyId] }) });
    assert.equal(foreign.status, 403);
    if (process.env.BILLING_MP_TEST_ENABLED !== 'true') {
      const checkout = await fetch(`http://127.0.0.1:${address.port}/api/billing/checkout`, { method: 'POST', headers: { cookie, 'X-GH-CSRF': '1' } });
      assert.equal(checkout.status, 503);
      assert.equal(((await checkout.json()) as { error: { code: string } }).error.code, 'BILLING_CHECKOUT_DISABLED');
    }
    if (process.env.BILLING_ENFORCEMENT_TESTING === 'true' && trial.trialEndsAt.getTime() <= Date.now()) {
      const apiBase = `http://127.0.0.1:${address.port}/api`;
      const list = await fetch(`${apiBase}/rooms`, { headers: { cookie } });
      assert.equal(list.status, 200);
      const write = await fetch(`${apiBase}/rooms`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'X-GH-CSRF': '1' }, body: '{}' });
      assert.equal(write.status, 403);
      const rejection = await write.json() as { error: { code: string; message: string } };
      assert.equal(rejection.error.code, trial.covered ? 'SUBSCRIPTION_EXPIRED' : 'HOTEL_NOT_COVERED');
      if (trial.covered) assert.match(rejection.error.message, /Tu prueba venció/);
      const webhook = await fetch(`${apiBase}/mp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      assert.notEqual(webhook.status, 401);
    }
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
    await client.end();
    const { prisma } = await import('../src/config/prisma.js');
    await prisma.$disconnect();
  }
});
