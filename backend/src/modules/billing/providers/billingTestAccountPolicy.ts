import type { DeclaredTestAccounts } from './billingTestAccounts.js';

export interface BillingTestAccountPolicyConfig {
  enabled: boolean;
  billingEnabled: boolean;
  environment: string;
  databaseUrl: string;
  sellerId: string;
  buyerId: string;
}

export function configuredBillingTestAccounts(config: BillingTestAccountPolicyConfig): DeclaredTestAccounts | null {
  if (!config.enabled) return null;
  let database: URL;
  try { database = new URL(config.databaseUrl); } catch { throw new Error('La política de cuentas de prueba requiere una base válida.'); }
  if (!config.billingEnabled || config.environment !== 'testing' || !['postgres:', 'postgresql:'].includes(database.protocol) || database.username !== 'postgres.sowbuvdeampxsbpgtgvo' || !database.hostname.endsWith('.pooler.supabase.com') || database.pathname !== '/postgres' || !['5432', '6543'].includes(database.port)) {
    throw new Error('La política de cuentas de prueba solo admite el proyecto de testing verificado.');
  }
  for (const [parameter] of database.searchParams) {
    if (['host', 'hostaddr', 'port', 'user', 'password', 'database', 'dbname', 'connectionstring', 'service', 'options'].includes(parameter.toLowerCase())) {
      throw new Error('La política de cuentas de prueba no admite redirecciones de conexión.');
    }
  }
  if (!/^[1-9]\d{0,199}$/.test(config.sellerId) || !/^[1-9]\d{0,199}$/.test(config.buyerId) || config.sellerId === config.buyerId) {
    throw new Error('La política de prueba requiere IDs distintos y válidos de vendedor y comprador.');
  }
  return { sellerId: config.sellerId, buyerId: config.buyerId };
}
