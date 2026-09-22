import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { addDays, nightsBetween, parseDate } from '../../lib/date.js';
import { decToNum, round2 } from '../../lib/money.js';

export async function summary(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const to = req.query.to !== undefined ? parseDate(req.query.to, 'to') : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from =
    req.query.from !== undefined
      ? parseDate(req.query.from, 'from')
      : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  if (to < from) throw badRequest('"from" no puede ser posterior a "to"');

  const days = nightsBetween(from, addDays(to, 1));
  const toExclusive = addDays(to, 1);

  const [activeRooms, roomIdsResult] = await Promise.all([
    prisma.room.count({ where: { isActive: true } }),
    prisma.room.findMany({ where: { isActive: true }, select: { id: true } }),
  ]);
  const roomIds = roomIdsResult.map((r) => r.id);

  const reservations = await prisma.reservation.findMany({
    where: {
      roomId: { in: roomIds.length > 0 ? roomIds : [-1] },
      status: { not: 'CANCELLED' },
      AND: [{ checkIn: { lt: toExclusive } }, { checkOut: { gt: from } }],
    },
    select: { checkIn: true, checkOut: true, roomId: true },
  });

  const bookedNights = new Map<number, Set<number>>();
  for (const r of reservations) {
    const set = bookedNights.get(r.roomId) ?? new Set<number>();
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i);
      if (r.checkIn < addDays(day, 1) && r.checkOut > day) set.add(i);
    }
    bookedNights.set(r.roomId, set);
  }

  let occupiedNights = 0;
  for (const set of bookedNights.values()) occupiedNights += set.size;

  const totalRoomNights = activeRooms * days;
  const occupancyPct = totalRoomNights > 0 ? round2((occupiedNights / totalRoomNights) * 100) : 0;

  const [payments, statusGroup, createdCount, checkIns, checkOuts] = await Promise.all([
    prisma.payment.findMany({
      where: { paidAt: { gte: from, lt: toExclusive } },
      select: { amount: true, method: true },
    }),
    prisma.reservation.groupBy({
      by: ['status'],
      where: {
        status: { not: 'CANCELLED' },
        AND: [{ checkIn: { lt: toExclusive } }, { checkOut: { gt: from } }],
      },
      _count: { _all: true },
    }),
    prisma.reservation.count({ where: { createdAt: { gte: from, lt: toExclusive } } }),
    prisma.reservation.count({ where: { checkedInAt: { gte: from, lt: toExclusive } } }),
    prisma.reservation.count({ where: { checkedOutAt: { gte: from, lt: toExclusive } } }),
  ]);

  const revenue = round2(payments.reduce((acc, p) => acc + decToNum(p.amount), 0));
  const revenueByMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = round2((acc[p.method] ?? 0) + decToNum(p.amount));
    return acc;
  }, {});

  res.json({
    data: {
      range: {
        from: from.toISOString().slice(0, 10),
        to: to.toISOString().slice(0, 10),
        days,
      },
      occupancy: {
        occupancyPct,
        occupiedRoomNights: occupiedNights,
        availableRoomNights: Math.max(0, totalRoomNights - occupiedNights),
        totalRoomNights,
      },
      revenue: {
        total: revenue,
        byMethod: revenueByMethod,
      },
      reservationsPage: {
        created: createdCount,
        checkIns,
        checkOuts,
      },
      statusDistribution: statusGroup.map((g) => ({ status: g.status, count: g._count._all })),
    },
  });
}