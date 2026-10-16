import { AsyncLocalStorage } from 'node:async_hooks';

type TenantContext = number | null;

const storage = new AsyncLocalStorage<TenantContext>();

export function withTenant<T>(companyId: number, fn: () => T): T {
  return storage.run(companyId, fn);
}

export function getTenantId(): number | null {
  return storage.getStore() ?? null;
}

// Ejecuta fn sin tenant activo para que la query extension de Prisma no
// inyecte companyId. Solo para lecturas cross-tenant puntuales (OWNER).
export function unscoped<T>(fn: () => T): T {
  return storage.run(null, fn);
}