import { env } from '../../config/env.js';
import { AppError } from '../../lib/AppError.js';
import { configuredBillingTestAccounts } from './providers/billingTestAccountPolicy.js';

export function billingTestAccountPolicy() {
  try {
    return configuredBillingTestAccounts({
      enabled: env.billingMpTest.configuredAccounts.enabled,
      sellerId: env.billingMpTest.configuredAccounts.sellerId,
      buyerId: env.billingMpTest.configuredAccounts.buyerId,
      billingEnabled: env.billingMpTest.enabled,
      environment: env.appEnv,
      databaseUrl: env.databaseUrl,
    });
  } catch {
    throw new AppError(503, 'BILLING_TEST_ACCOUNTS_CONFIG', 'La política de cuentas de prueba no está configurada correctamente.');
  }
}
