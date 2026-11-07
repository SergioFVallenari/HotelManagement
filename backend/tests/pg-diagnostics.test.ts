import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { instrumentPgPool } from '../src/lib/pgDiagnostics.js';
import { createPerformanceTrace, finishPerformanceTrace, measureDatabaseOperation, withPerformanceTrace } from '../src/lib/performance.js';

function fakePool(options: { acquireError?: Error; queryError?: Error; syncError?: Error } = {}) {
  let queries = 0;
  let releases = 0;
  const result = { rows: [{ private: 'no registrar' }] };
  const release = () => { releases++; };
  const client = {
    query(this: unknown, ...args: unknown[]) {
      assert.equal(this, client);
      queries++;
      if (options.syncError) throw options.syncError;
      const callback = args.at(-1);
      if (typeof callback === 'function') {
        queueMicrotask(() => callback(options.queryError, options.queryError ? undefined : result));
        return undefined;
      }
      return options.queryError ? Promise.reject(options.queryError) : Promise.resolve(result);
    },
    release,
  };
  const pool = {
    totalCount: 1, idleCount: 0, waitingCount: 0, options: { max: 5 },
    connect(this: unknown, callback?: (error: Error | undefined, client: unknown, release: () => void) => void) {
      assert.equal(this, pool);
      if (callback) {
        queueMicrotask(() => callback(options.acquireError, options.acquireError ? undefined : client, release));
        return undefined;
      }
      return options.acquireError ? Promise.reject(options.acquireError) : Promise.resolve(client);
    },
  };
  return { pool: instrumentPgPool(pool as unknown as Pool), result, get queries() { return queries; }, get releases() { return releases; } };
}

test('separa adquisición y consulta con promesas, sin registrar SQL ni resultados', async () => {
  const fake = fakePool();
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, () => measureDatabaseOperation('Company.findUnique', async () => {
    const client = await fake.pool.connect();
    assert.equal(await client.query('SQL privado', ['parametro privado']), fake.result);
    client.release();
  }));
  const report = finishPerformanceTrace(trace);
  assert.equal(report.driverAcquireCount, 1);
  assert.equal(report.driverQueryCount, 1);
  assert.deepEqual(report.driverEvents.map((event) => event.phase), ['acquire', 'query']);
  assert.ok(report.driverEvents.every((event) => !event.failed));
  assert.equal(report.newConnectionCount, 1);
  assert.ok(report.driverAcquireSumMs >= 0);
  assert.ok(report.driverQuerySumMs >= 0);
  assert.equal(report.driverEvents[0]!.newConnection, true);
  assert.deepEqual(report.driverEvents[0]!.poolBefore, { total: 1, idle: 0, waiting: 0, max: 5 });
  assert.ok(!JSON.stringify(report).includes('privado'));
  assert.ok(!JSON.stringify(report).includes('registrar'));
  assert.equal(fake.queries, 1);
  assert.equal(fake.releases, 1);
});

test('preserva callbacks, liberación y conexión reutilizada sin duplicar instrumentación', async () => {
  const fake = fakePool();
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      await measureDatabaseOperation('Room.findMany', () => new Promise<void>((resolve, reject) => {
        const returned = fake.pool.connect((error, client, release) => {
          if (error) return reject(error);
          client!.query('SQL privado', (error, result) => {
            if (error) return reject(error);
            assert.equal(result, fake.result);
            release();
            resolve();
          });
        });
        assert.equal(returned, undefined);
      }));
    }
  });
  const report = finishPerformanceTrace(trace);
  assert.deepEqual(report.driverEvents.filter((event) => event.phase === 'acquire').map((event) => event.newConnection), [true, false]);
  assert.equal(report.driverQueryCount, 2);
  assert.equal(fake.queries, 2);
  assert.equal(fake.releases, 2);
});

test('registra fallos de adquisición sin cambiar el error ni consultar', async () => {
  const error = new Error('secreto');
  const fake = fakePool({ acquireError: error });
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, async () => {
    await assert.rejects(fake.pool.connect(), (caught) => caught === error);
    await new Promise<void>((resolve) => fake.pool.connect((caught, client) => {
      assert.equal(caught, error);
      assert.equal(client, undefined);
      resolve();
    }));
  });
  const report = finishPerformanceTrace(trace);
  assert.equal(report.driverAcquireCount, 2);
  assert.equal(report.driverQueryCount, 0);
  assert.ok(report.driverEvents.every((event) => event.failed));
  assert.equal(fake.queries, 0);
  assert.ok(!JSON.stringify(report).includes('secreto'));
});

test('preserva errores de consulta tanto por promesa como por callback', async () => {
  const error = new Error('secreto');
  const fake = fakePool({ queryError: error });
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, async () => {
    const client = await fake.pool.connect();
    await assert.rejects(client.query('SQL privado'), (caught) => caught === error);
    await new Promise<void>((resolve) => client.query('SQL privado', (caught) => {
      assert.equal(caught, error);
      resolve();
    }));
    client.release();
  });
  const report = finishPerformanceTrace(trace);
  assert.equal(report.driverQueryCount, 2);
  assert.ok(report.driverEvents.filter((event) => event.phase === 'query').every((event) => event.failed));
  assert.ok(!JSON.stringify(report).includes('secreto'));
});

test('preserva excepciones síncronas de consulta', async () => {
  const error = new Error('secreto');
  const fake = fakePool({ syncError: error });
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, async () => {
    const client = await fake.pool.connect();
    assert.throws(() => client.query('SQL privado'), (caught) => caught === error);
    client.release();
  });
  assert.equal(finishPerformanceTrace(trace).driverEvents.at(-1)!.failed, true);
});

test('no registra consultas fuera de una petición ni después de finalizarla', async () => {
  const fake = fakePool();
  const client = await fake.pool.connect();
  await client.query('SQL privado');
  const trace = createPerformanceTrace();
  finishPerformanceTrace(trace);
  await withPerformanceTrace(trace, () => client.query('SQL privado'));
  client.release();
  assert.equal(trace.driverEvents.length, 0);
  assert.equal(fake.queries, 2);
});

test('mantiene el contexto de peticiones concurrentes cuando el pool entrega callbacks desde otro contexto', async () => {
  const pending: (() => void)[] = [];
  const makeClient = () => ({
    query() { return Promise.resolve({ rows: [] }); },
    release() {},
  });
  const pool = instrumentPgPool({
    totalCount: 2, idleCount: 0, waitingCount: 0, options: { max: 5 },
    connect(callback: (error: undefined, client: unknown, release: () => void) => void) {
      pending.push(() => callback(undefined, makeClient(), () => {}));
    },
  } as unknown as Pool);
  const first = createPerformanceTrace();
  const second = createPerformanceTrace();
  const query = () => new Promise<void>((resolve, reject) => pool.connect((error, client, release) => {
    if (error) return reject(error);
    void client!.query('SQL privado').then(() => { release(); resolve(); }, reject);
  }));
  const firstQuery = withPerformanceTrace(first, query);
  const secondQuery = withPerformanceTrace(second, query);
  for (const callback of pending) callback();
  await Promise.all([firstQuery, secondQuery]);
  assert.equal(finishPerformanceTrace(first).driverQueryCount, 1);
  assert.equal(finishPerformanceTrace(second).driverQueryCount, 1);
});
