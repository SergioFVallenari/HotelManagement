import type { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { TRIAL_LIMITS } from './billing.entitlements.js';

type BillingRoomTransaction = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function lockCompanyForRoomLimit(tx: BillingRoomTransaction, companyId: number): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Company" WHERE id = ${companyId} FOR UPDATE`;
}

export async function assertRoomCapacity(tx: BillingRoomTransaction, companyId: number): Promise<void> {
  const coverage = await tx.ownerBillingCoverage.findUnique({ where: { companyId }, select: { account: { select: { status: true } } } });
  if (!coverage) throw new AppError(503, 'BILLING_INCOMPLETE', 'No se pudo verificar la suscripción del alojamiento');
  if (coverage.account.status === 'GRANDFATHERED') return;
  const active = await tx.room.count({ where: { companyId, isActive: true } });
  if (active >= TRIAL_LIMITS.MAX_ROOMS) throw new AppError(409, 'ROOM_LIMIT_REACHED', `Tu alojamiento alcanzó el límite de ${TRIAL_LIMITS.MAX_ROOMS} habitaciones activas.`);
}
