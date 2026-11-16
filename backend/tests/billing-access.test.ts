import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionAllowsOperation, type BillingOperation } from '../src/modules/billing/billing.access.js';

const readOnly: BillingOperation[] = ['CONSULTAR', 'CUENTA_FACTURACION', 'EXPORTAR', 'CONSULTAR_RESERVA_PUBLICA'];
const writes: BillingOperation[] = ['MODIFICAR_DATOS', 'CREAR_RESERVA_PUBLICA'];

test('trial vigente y empresas grandfathered permiten las operaciones definidas', () => {
  for (const status of ['TRIALING', 'GRANDFATHERED'] as const) {
    for (const operation of [...readOnly, ...writes]) assert.equal(subscriptionAllowsOperation(status, operation), true);
  }
});

test('trial vencido conserva lecturas, facturación y exportación', () => {
  for (const operation of readOnly) assert.equal(subscriptionAllowsOperation('EXPIRED', operation), true);
  for (const operation of writes) assert.equal(subscriptionAllowsOperation('EXPIRED', operation), false);
});
