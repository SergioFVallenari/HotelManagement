import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContext = number | null;

const storage = new AsyncLocalStorage<TenantContext>();

export function withTenant<T>(companyId: number, fn: () => T): T {
  return storage.run(companyId, fn);
}

export function getTenantId(): number | null {
  return storage.getStore() ?? null;
}