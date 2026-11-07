import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import { createPerformanceTrace, finishPerformanceTrace, measureDatabaseOperation, withPerformanceTrace } from '../src/lib/performance.js';
import { performanceDiagnostics } from '../src/middleware/performance.js';

test('sin contexto ejecuta la operación sin alterar su resultado', async () => {
  assert.equal(await measureDatabaseOperation('Room.count', async () => 4), 4);
});

test('registra operaciones y tiempos sin resultados ni parámetros', async () => {
  const trace = createPerformanceTrace();
  await withPerformanceTrace(trace, () => measureDatabaseOperation('Room.count', async () => ({ secret: 'no registrar' })));
  const report = finishPerformanceTrace(trace);
  assert.equal(report.prismaOperationCount, 1);
  assert.equal(report.operations[0]!.operation, 'Room.count');
  assert.equal(report.operations[0]!.failed, false);
  assert.ok(report.totalMs >= 0);
  assert.ok(report.operations[0]!.startMs >= 0);
  assert.ok(report.prismaOperationSumMs >= 0);
  assert.ok(!JSON.stringify(report).includes('secret'));
});

test('conserva el error original y registra el fallo sin su mensaje', async () => {
  const trace = createPerformanceTrace();
  const error = new Error('dato privado');
  await assert.rejects(withPerformanceTrace(trace, () => measureDatabaseOperation('Room.findMany', async () => { throw error; })), (caught) => caught === error);
  assert.equal(trace.operations[0]!.failed, true);
  assert.ok(!JSON.stringify(finishPerformanceTrace(trace)).includes('dato privado'));
});

test('aísla peticiones concurrentes', async () => {
  const first = createPerformanceTrace();
  const second = createPerformanceTrace();
  await Promise.all([
    withPerformanceTrace(first, () => measureDatabaseOperation('Room.count', async () => { await Promise.resolve(); return 1; })),
    withPerformanceTrace(second, () => measureDatabaseOperation('Service.count', async () => 2)),
  ]);
  assert.deepEqual(first.operations.map((item) => item.operation), ['Room.count']);
  assert.deepEqual(second.operations.map((item) => item.operation), ['Service.count']);
});

test('no agrega operaciones después de cerrar la medición', async () => {
  const trace = createPerformanceTrace();
  finishPerformanceTrace(trace);
  await withPerformanceTrace(trace, () => measureDatabaseOperation('Room.count', async () => 1));
  assert.equal(trace.operations.length, 0);
});

function response() {
  return Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableFinished: false,
    headers: {} as Record<string, string>,
    setHeader(name: string, value: string) { this.headers[name] = value; },
  });
}

test('el middleware correlaciona la respuesta, normaliza la ruta y registra una sola vez', async (context) => {
  const logs = context.mock.method(console, 'info', () => {});
  const res = response();
  let operation: Promise<number> | undefined;
  performanceDiagnostics(true)(
    { method: 'GET', path: '/api/public/availability/hotel-privado/calendar' } as Request,
    res as unknown as Response,
    () => { operation = measureDatabaseOperation('Room.findMany', async () => 1); },
  );
  await operation;
  res.writableFinished = true;
  res.emit('finish');
  res.emit('close');
  assert.ok(res.headers['X-Diagnostic-Id']);
  assert.equal(logs.mock.callCount(), 1);
  const [prefix, json] = logs.mock.calls[0]!.arguments as unknown as [string, string];
  const report = JSON.parse(json);
  assert.equal(prefix, '[perf]');
  assert.equal(report.requestId, res.headers['X-Diagnostic-Id']);
  assert.equal(report.endpoint, '/api/public/availability/:slug/calendar');
  assert.equal(report.prismaOperationCount, 1);
  assert.equal(report.aborted, false);
  assert.ok(!json.includes('hotel-privado'));
});

test('el middleware no mide si está desactivado o fuera de las rutas elegidas', () => {
  for (const [enabled, method, path] of [
    [false, 'GET', '/api/calendar'],
    [true, 'POST', '/api/calendar'],
    [true, 'GET', '/api/public/booking/token-privado'],
  ] as const) {
    const res = response();
    let continued = false;
    performanceDiagnostics(enabled)({ method, path } as Request, res as unknown as Response, () => { continued = true; });
    assert.equal(continued, true);
    assert.deepEqual(res.headers, {});
    assert.equal(res.listenerCount('finish'), 0);
  }
});

test('registra las respuestas interrumpidas', (context) => {
  const logs = context.mock.method(console, 'info', () => {});
  const res = response();
  performanceDiagnostics(true)({ method: 'GET', path: '/api/calendar' } as Request, res as unknown as Response, () => {});
  res.emit('close');
  const [, json] = logs.mock.calls[0]!.arguments as unknown as [string, string];
  assert.equal(JSON.parse(json).aborted, true);
});
