import { AsyncLocalStorage } from 'node:async_hooks';

interface DatabaseTiming {
  operation: string;
  startMs: number;
  durationMs: number;
  failed: boolean;
}

export interface PoolSnapshot {
  total: number;
  idle: number;
  waiting: number;
  max: number;
}

interface DriverTiming {
  phase: 'acquire' | 'query';
  startMs: number;
  durationMs: number;
  failed: boolean;
  poolBefore: PoolSnapshot;
  poolAfter: PoolSnapshot;
  newConnection?: boolean;
}

export interface PerformanceTrace {
  startedAt: number;
  operations: DatabaseTiming[];
  driverEvents: DriverTiming[];
  completed: boolean;
}

const storage = new AsyncLocalStorage<PerformanceTrace>();
const milliseconds = (value: number) => Math.round(value * 100) / 100;

export function createPerformanceTrace(): PerformanceTrace {
  return { startedAt: performance.now(), operations: [], driverEvents: [], completed: false };
}

export function withPerformanceTrace<T>(trace: PerformanceTrace, action: () => T): T {
  return storage.run(trace, action);
}

export async function measureDatabaseOperation<T>(operation: string, action: () => PromiseLike<T>): Promise<T> {
  const trace = storage.getStore();
  if (!trace || trace.completed) return action();
  const startedAt = performance.now();
  let failed = false;
  try {
    return await action();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (!trace.completed) trace.operations.push({ operation, startMs: milliseconds(startedAt - trace.startedAt), durationMs: milliseconds(performance.now() - startedAt), failed });
  }
}

export function startDriverTiming(phase: DriverTiming['phase'], snapshot: () => PoolSnapshot) {
  const trace = storage.getStore();
  if (!trace || trace.completed) return undefined;
  const startedAt = performance.now();
  const poolBefore = snapshot();
  let finished = false;
  return (failed: boolean, newConnection?: boolean) => {
    if (finished || trace.completed) return;
    finished = true;
    trace.driverEvents.push({
      phase, startMs: milliseconds(startedAt - trace.startedAt),
      durationMs: milliseconds(performance.now() - startedAt), failed,
      poolBefore, poolAfter: snapshot(),
      ...(newConnection !== undefined ? { newConnection } : {}),
    });
  };
}

export function finishPerformanceTrace(trace: PerformanceTrace) {
  trace.completed = true;
  return {
    totalMs: milliseconds(performance.now() - trace.startedAt),
    prismaOperationCount: trace.operations.length,
    prismaOperationSumMs: milliseconds(trace.operations.reduce((sum, operation) => sum + operation.durationMs, 0)),
    operations: [...trace.operations],
    driverAcquireCount: trace.driverEvents.filter((event) => event.phase === 'acquire').length,
    driverQueryCount: trace.driverEvents.filter((event) => event.phase === 'query').length,
    driverAcquireSumMs: milliseconds(trace.driverEvents.filter((event) => event.phase === 'acquire').reduce((sum, event) => sum + event.durationMs, 0)),
    driverQuerySumMs: milliseconds(trace.driverEvents.filter((event) => event.phase === 'query').reduce((sum, event) => sum + event.durationMs, 0)),
    newConnectionCount: trace.driverEvents.filter((event) => event.newConnection).length,
    driverEvents: [...trace.driverEvents],
  };
}
