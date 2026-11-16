import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { unscoped } from '../../lib/tenant.js';
import { AppError } from '../../lib/AppError.js';
import { TRIAL_LIMITS } from './billing.entitlements.js';

export async function preflightUserLimit(companyId: number): Promise<void> {
  if (!env.billingLimitsTesting) return;
  const setting = await prisma.$queryRaw<Array<{ enabled: boolean }>>`SELECT "userLimitEnabled" AS enabled FROM "BillingLimitControl" WHERE id = 1`;
  if (!setting[0]?.enabled) return;
  const [coverage, active] = await unscoped(() => Promise.all([
    prisma.ownerBillingCoverage.findUnique({ where: { companyId }, select: { account: { select: { status: true } } } }),
    prisma.userCompany.count({ where: { companyId, isActive: true } }),
  ]));
  if (!coverage) throw new AppError(503, 'BILLING_INCOMPLETE', 'No se pudo verificar la suscripción del alojamiento');
  if (coverage.account.status !== 'GRANDFATHERED' && active >= TRIAL_LIMITS.MAX_USERS) {
    throw new AppError(409, 'USER_LIMIT_REACHED', `Tu alojamiento alcanzó el límite de ${TRIAL_LIMITS.MAX_USERS} usuarios activos.`);
  }
}
