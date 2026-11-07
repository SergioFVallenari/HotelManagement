import type { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { startDriverTiming } from './performance.js';

type DriverFunction = (this: unknown, ...args: unknown[]) => unknown;

function observeCall(original: DriverFunction, args: unknown[], receiver: unknown, finish: (failed: boolean) => void) {
  const callback = args.at(-1);
  const observedArgs = typeof callback === 'function' ? [
    ...args.slice(0, -1),
    function (this: unknown, ...values: unknown[]) {
      finish(Boolean(values[0]));
      return Reflect.apply(callback, this, values);
    },
  ] : args;
  try {
    const result = Reflect.apply(original, receiver, observedArgs);
    if (typeof callback !== 'function' && result && typeof (result as PromiseLike<unknown>).then === 'function') {
      void (result as PromiseLike<unknown>).then(() => finish(false), () => finish(true));
    }
    return result;
  } catch (error) {
    finish(true);
    throw error;
  }
}

export function instrumentPgPool(pool: Pool): Pool {
  const snapshot = () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, max: pool.options.max ?? 10 });
  const clients = new WeakSet<PoolClient>();
  const connect = pool.connect;

  function observeClient(client: PoolClient) {
    if (clients.has(client)) return false;
    clients.add(client);
    const query = client.query;
    client.query = function (this: PoolClient, ...args: unknown[]) {
      const finish = startDriverTiming('query', snapshot);
      if (!finish || (args[0] && typeof (args[0] as { submit?: unknown }).submit === 'function')) {
        return Reflect.apply(query, this, args);
      }
      return observeCall(query as DriverFunction, args, this, finish);
    } as typeof client.query;
    return true;
  }

  pool.connect = function (this: Pool, callback?: (error: Error | undefined, client: PoolClient | undefined, release: (error?: Error | boolean) => void) => void) {
    const finish = startDriverTiming('acquire', snapshot);
    if (callback) {
      const runInContext = AsyncLocalStorage.snapshot();
      return connect.call(this, (error, client, release) => {
        const newConnection = client ? observeClient(client) : undefined;
        finish?.(Boolean(error), newConnection);
        runInContext(callback, error, client, release);
      });
    }
    return (Reflect.apply(connect, this, []) as Promise<PoolClient>).then((client) => {
      const newConnection = observeClient(client);
      finish?.(false, newConnection);
      return client;
    }, (error: unknown) => {
      finish?.(true);
      throw error;
    });
  } as typeof pool.connect;
  return pool;
}
