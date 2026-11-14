import { prisma } from '../../config/prisma.js';
import { unscoped } from '../../lib/tenant.js';
import { evaluateObservation, type ObservedLimit } from './billing.entitlements.js';
import { resolveOwnerBillingStatus } from './billing.effective.js';

export async function observeActiveLimit(companyId: number, limit: ObservedLimit): Promise<void> {
  try {
    const [account, activeCount] = await unscoped(() => Promise.all([
      prisma.ownerBillingCoverage.findUnique({
        where: { companyId },
        select: { account: { select: { id: true, status: true, trialEndsAt: true } } },
      }),
      limit === 'MAX_ROOMS'
        ? prisma.room.count({ where: { companyId, isActive: true } })
        : prisma.userCompany.count({ where: { companyId, isActive: true } }),
    ]));
    if (!account?.account) {
      console.warn('[billing] Observación sin suscripción', { companyId, limit });
      return;
    }
    const now = new Date();
    const effective = await resolveOwnerBillingStatus(account.account, now);
    const result = evaluateObservation({ ...account.account, now, limit, activeCount, paidActive: effective.status === 'ACTIVE' });
    if (result.exceeded || result.effectiveStatus === 'EXPIRED') {
      console.warn('[billing] Observación de acceso', { companyId, limit, activeCount, ...result });
    }
  } catch {
    console.error('[billing] No se pudo observar el límite', { companyId, limit });
  }
}
