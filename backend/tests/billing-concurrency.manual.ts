import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

async function main(): Promise<void> {
  const database = new URL(process.env.DIRECT_URL!);
  const runtime = new URL(process.env.DATABASE_URL!);
  const supabaseUrl = new URL(process.env.SUPABASE_URL!);
  if (database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || runtime.username !== database.username || supabaseUrl.hostname !== 'sowbuvdeampxsbpgtgvo.supabase.co') {
    throw new Error('Las conexiones no apuntan al proyecto de testing autorizado');
  }
  process.env.BILLING_LIMITS_TESTING = 'true';
  process.env.BILLING_ENFORCEMENT_TESTING = 'false';
  const db = new pg.Client({ connectionString: process.env.DIRECT_URL, ssl: { rejectUnauthorized: false } });
  const auth = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const tag = `billing-concurrency-${randomUUID()}`;
  let ownerId: number | undefined;
  let companyId: number | undefined;
  let controlChanged = false;
  let server: ReturnType<ReturnType<typeof import('../src/app.js').createApp>['listen']> | undefined;
  await db.connect();
  try {
    const control = await db.query('UPDATE public."BillingLimitControl" SET "userLimitEnabled" = true WHERE id = 1 AND "userLimitEnabled" = false RETURNING id');
    if (control.rowCount !== 1) throw new Error('El control de usuarios no está desactivado o no existe');
    controlChanged = true;
    const roles = await db.query('SELECT id, role FROM public."UserType" WHERE role IN ($1, $2)', ['OWNER', 'RECEPCIONISTA']);
    const ownerRole = roles.rows.find((r) => r.role === 'OWNER');
    const employeeRole = roles.rows.find((r) => r.role === 'RECEPCIONISTA');
    if (!ownerRole || !employeeRole) throw new Error('Faltan roles de prueba');
    const owner = await db.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`${tag}-owner@example.test`]);
    ownerId = owner.rows[0].id;
    const company = await db.query('INSERT INTO public."Company" (name, "createdById", "updatedAt") VALUES ($1, $2, now()) RETURNING id', [tag, ownerId]);
    companyId = company.rows[0].id;
    await db.query('INSERT INTO public."UserCompany" ("userId", "companyId", username, "typeId", "updatedAt") VALUES ($1, $2, $3, $4, now())', [ownerId, companyId, `${tag}-owner`, ownerRole.id]);
    const employee = await db.query('INSERT INTO public."User" (email, "updatedAt") VALUES ($1, now()) RETURNING id', [`${tag}-existing@example.test`]);
    await db.query('INSERT INTO public."UserCompany" ("userId", "companyId", username, "typeId", "updatedAt") VALUES ($1, $2, $3, $4, now())', [employee.rows[0].id, companyId, `${tag}-existing`, employeeRole.id]);
    const type = await db.query('INSERT INTO public."RoomType" (name, "companyId") VALUES ($1, $2) RETURNING id', [tag, companyId]);
    for (let n = 0; n < 4; n++) await db.query('INSERT INTO public."Room" (number, "typeId", "companyId", price, amenities, "updatedAt") VALUES ($1, $2, $3, 0, $4, now())', [`${n}`, type.rows[0].id, companyId, []]);
    const { createApp } = await import('../src/app.js');
    server = createApp().listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No se pudo iniciar el servidor de prueba');
    const cookie = `gh_token=${jwt.sign({ id: ownerId, companyId, role: 'OWNER', username: `${tag}-owner`, name: 'Prueba', email: `${tag}-owner@example.test` }, process.env.JWT_SECRET!)}`;
    const post = async (path: string, body: object) => {
      const response = await fetch(`http://127.0.0.1:${address.port}/api${path}`, { method: 'POST', headers: { cookie, 'content-type': 'application/json', 'X-GH-CSRF': '1' }, body: JSON.stringify(body) });
      const payload = await response.json() as { error?: { code?: string; message?: string } };
      return { status: response.status, code: payload.error?.code, message: payload.error?.message };
    };
    const rooms = await Promise.all([4, 5].map((n) => post('/rooms', { number: `${n}`, typeId: type.rows[0].id })));
    const users = await Promise.all([1, 2].map((n) => post('/users', { username: `${tag}-${n}`.slice(0, 50), email: `${tag}-${n}@example.test`, password: `Aa!${randomUUID()}`, role: 'RECEPCIONISTA', companyId })));
    const counts = await db.query('SELECT (SELECT count(*)::int FROM public."Room" WHERE "companyId" = $1 AND "isActive") AS rooms, (SELECT count(*)::int FROM public."UserCompany" WHERE "companyId" = $1 AND "isActive") AS users', [companyId]);
    console.log(JSON.stringify({ rooms, users, counts: counts.rows[0] }, null, 2));
    if (counts.rows[0].rooms !== 5 || counts.rows[0].users !== 3 || rooms.filter((r) => r.status === 201).length !== 1 || users.filter((r) => r.status === 201).length !== 1 || !rooms.some((r) => r.status === 409 && r.code === 'ROOM_LIMIT_REACHED') || !users.some((r) => r.status === 409 && r.code === 'USER_LIMIT_REACHED')) throw new Error('La prueba de concurrencia no cumplió los límites esperados');
  } finally {
    if (controlChanged) await db.query('UPDATE public."BillingLimitControl" SET "userLimitEnabled" = false WHERE id = 1');
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
    if (ownerId) {
      const authUsers = await db.query('SELECT id, "authUserId" FROM public."User" WHERE email LIKE $1', [`${tag}-%@example.test`]);
      for (const row of authUsers.rows) {
        if (row.authUserId) {
          const { error } = await auth.auth.admin.deleteUser(row.authUserId);
          if (error) throw new Error(`No se pudo eliminar la cuenta de prueba: ${error.message}`);
        }
      }
      if (companyId) {
        await db.query('DELETE FROM public."UserCompany" WHERE "companyId" = $1', [companyId]);
        await db.query('DELETE FROM public."Room" WHERE "companyId" = $1', [companyId]);
        await db.query('DELETE FROM public."RoomType" WHERE "companyId" = $1', [companyId]);
        await db.query('DELETE FROM public."OwnerBillingCoverage" WHERE "companyId" = $1', [companyId]);
      }
      await db.query('DELETE FROM public."OwnerBillingAccount" WHERE "ownerId" = $1', [ownerId]);
      if (companyId) await db.query('DELETE FROM public."Company" WHERE id = $1', [companyId]);
      await db.query('DELETE FROM public."User" WHERE email LIKE $1', [`${tag}-%@example.test`]);
    }
    await db.end();
    const { prisma } = await import('../src/config/prisma.js');
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => { console.error('[billing] Prueba de concurrencia falló', err instanceof Error ? err.message : err); process.exitCode = 1; });
