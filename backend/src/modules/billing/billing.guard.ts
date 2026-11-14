import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { resolveOwnerBillingStatus } from './billing.effective.js';
import { subscriptionAllowsOperation, type BillingOperation } from './billing.access.js';

export async function assertBillingOperation(companyId: number, operation: BillingOperation, role?: string): Promise<void> {
  if (!env.billingEnforcementTesting) return;
  const coverage = await prisma.ownerBillingCoverage.findUnique({
    where: { companyId },
    select: { covered: true, account: { select: { id: true, status: true, trialEndsAt: true } } },
  });
  const subscription = coverage?.account;
  if (!subscription) throw new AppError(503, 'BILLING_INCOMPLETE', 'No se pudo verificar la suscripción del alojamiento');
  if (!coverage.covered && operation !== 'CONSULTAR' && operation !== 'CUENTA_FACTURACION' && operation !== 'EXPORTAR' && operation !== 'CONSULTAR_RESERVA_PUBLICA') {
    throw new AppError(403, 'HOTEL_NOT_COVERED', 'Este alojamiento no está cubierto por la suscripción.');
  }
  const { status } = await resolveOwnerBillingStatus(subscription, new Date());
  if (status === 'ACTIVE' && !subscriptionAllowsOperation('EXPIRED', operation)) {
    const coveredCount = await prisma.ownerBillingCoverage.count({ where: { accountId: subscription.id, covered: true } });
    if (coveredCount > 1) throw new AppError(403, 'BILLING_HOTEL_SELECTION_REQUIRED', role === 'OWNER' ? 'Elegí un solo alojamiento para cubrir con tu plan pago.' : 'El propietario debe elegir un solo alojamiento para el plan pago.');
  }
  if (!subscriptionAllowsOperation(status, operation)) {
    throw new AppError(403, 'SUBSCRIPTION_EXPIRED', role === 'OWNER'
      ? 'Tu prueba venció. Gestioná tu suscripción para continuar.'
      : 'La prueba del alojamiento venció. Contactá al propietario para gestionar la suscripción.');
  }
}
