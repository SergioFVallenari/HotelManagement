import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { resolveOwnerBillingStatus, validPaidPeriod } from './billing.effective.js';
import { updateCoverageSchema } from './billing.schema.js';
import { TRIAL_MAX_HOTELS } from './billing.coverage.js';
import { TRIAL_LIMITS } from './billing.entitlements.js';
import { unscoped } from '../../lib/tenant.js';
import { beginTestCheckout } from './billing.checkout.js';
import { env } from '../../config/env.js';
import { testCheckoutAvailable } from './billing.checkoutAvailability.js';

export async function getSubscription(req: Request, res: Response): Promise<void> {
  const coverage = await prisma.ownerBillingCoverage.findUnique({
    where: { companyId: req.user!.companyId },
    select: {
      covered: true,
      account: { select: { id: true, status: true, trialStartedAt: true, trialEndsAt: true } },
    },
  });
  const subscription = coverage?.account;
  if (!subscription) {
    throw new AppError(500, 'BILLING_INCOMPLETE', 'La configuración de suscripción está incompleta');
  }
  const effective = await resolveOwnerBillingStatus(subscription, new Date());
  const needsHotelSelection = effective.status === 'ACTIVE' && await prisma.ownerBillingCoverage.count({ where: { accountId: subscription.id, covered: true } }) > 1;
  res.json({ data: {
    ...effective,
    trialStartedAt: subscription.trialStartedAt,
    trialEndsAt: subscription.trialEndsAt,
    covered: coverage.covered,
    needsHotelSelection,
    plan: { code: 'LAIXIA', name: 'LAIXIA' },
  } });
}

export async function getCoverage(req: Request, res: Response): Promise<void> {
  const account = await prisma.ownerBillingAccount.findUnique({
    where: { ownerId: req.user!.id },
    select: { id: true, status: true, trialStartedAt: true, trialEndsAt: true, hotels: { select: { companyId: true, covered: true, company: { select: { name: true } } }, orderBy: { companyId: 'asc' } } },
  });
  if (!account) throw new AppError(404, 'BILLING_NOT_FOUND', 'No se encontró tu cuenta de suscripción');
  const effective = await resolveOwnerBillingStatus(account, new Date());
  const companyIds = account.hotels.map((hotel) => hotel.companyId);
  const [rooms, users] = companyIds.length ? await unscoped(() => Promise.all([
    prisma.room.groupBy({ by: ['companyId'], where: { companyId: { in: companyIds }, isActive: true }, _count: { _all: true } }),
    prisma.userCompany.groupBy({ by: ['companyId'], where: { companyId: { in: companyIds }, isActive: true }, _count: { _all: true } }),
  ])) : [[], []];
  const roomCounts = new Map(rooms.map((row) => [row.companyId, row._count._all]));
  const userCounts = new Map(users.map((row) => [row.companyId, row._count._all]));
  res.json({ data: {
    ...effective,
    trialStartedAt: account.trialStartedAt,
    trialEndsAt: account.trialEndsAt,
    maximumHotels: account.status === 'GRANDFATHERED' ? null : effective.status === 'ACTIVE' ? 1 : TRIAL_MAX_HOTELS,
    maximumRoomsPerHotel: account.status === 'GRANDFATHERED' ? null : TRIAL_LIMITS.MAX_ROOMS,
    maximumUsersPerHotel: account.status === 'GRANDFATHERED' ? null : TRIAL_LIMITS.MAX_USERS,
    testCheckout: testCheckoutAvailable(env.billingMpTest) ? { available: true, monthlyPrice: env.billingMpTest.monthlyPrice, currency: 'ARS' } : { available: false, monthlyPrice: null, currency: null },
    hotels: account.hotels.map((hotel) => ({ id: hotel.companyId, name: hotel.company.name, covered: hotel.covered, activeRooms: roomCounts.get(hotel.companyId) ?? 0, activeUsers: userCounts.get(hotel.companyId) ?? 0 })),
  } });
}

export async function updateCoverage(req: Request, res: Response): Promise<void> {
  const { companyIds } = updateCoverageSchema.parse(req.body);
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: number; status: string }>>`
      SELECT id, status::text AS status FROM "OwnerBillingAccount" WHERE "ownerId" = ${req.user!.id} FOR UPDATE
    `;
    const account = rows[0];
    if (!account) throw new AppError(404, 'BILLING_NOT_FOUND', 'No se encontró tu cuenta de suscripción');
    if (account.status === 'GRANDFATHERED') throw new AppError(409, 'BILLING_MANAGED', 'La cobertura de esta cuenta todavía no se puede modificar');
    if (env.billingPaidAccessTesting && companyIds.length > 1) {
      const now = new Date();
      const period = await tx.ownerBillingPeriod.findFirst({
        where: { contract: { accountId: account.id }, startsAt: { lte: now }, endsAt: { gt: now }, payment: { is: { status: 'APPROVED' } } },
        orderBy: { endsAt: 'desc' },
        select: { contractId: true, amount: true, currency: true, payment: { select: { contractId: true, amount: true, currency: true, paidAt: true } } },
      });
      if (validPaidPeriod(period)) throw new AppError(409, 'BILLING_HOTEL_LIMIT', 'El plan pago cubre un solo alojamiento.');
    }
    const hotels = await tx.ownerBillingCoverage.findMany({ where: { accountId: account.id }, select: { companyId: true } });
    const ownIds = new Set(hotels.map((hotel) => hotel.companyId));
    if (companyIds.some((id) => !ownIds.has(id))) throw new AppError(403, 'FORBIDDEN', 'Solo podés administrar tus hoteles');
    await tx.ownerBillingCoverage.updateMany({ where: { accountId: account.id }, data: { covered: false } });
    if (companyIds.length) await tx.ownerBillingCoverage.updateMany({ where: { accountId: account.id, companyId: { in: companyIds } }, data: { covered: true } });
  });
  await getCoverage(req, res);
}

export async function checkout(req: Request, res: Response): Promise<void> {
  const result = await beginTestCheckout(req.user!.id);
  res.status(201).json({ data: result });
}
