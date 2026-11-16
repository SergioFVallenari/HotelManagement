import type { BillingStatus } from './billing.status.js';

export type BillingOperation =
  | 'CONSULTAR'
  | 'CUENTA_FACTURACION'
  | 'EXPORTAR'
  | 'CONSULTAR_RESERVA_PUBLICA'
  | 'MODIFICAR_DATOS'
  | 'CREAR_RESERVA_PUBLICA';

const READ_ONLY_OPERATIONS = new Set<BillingOperation>([
  'CONSULTAR',
  'CUENTA_FACTURACION',
  'EXPORTAR',
  'CONSULTAR_RESERVA_PUBLICA',
]);

export function subscriptionAllowsOperation(status: BillingStatus, operation: BillingOperation): boolean {
  return status !== 'EXPIRED' || READ_ONLY_OPERATIONS.has(operation);
}
