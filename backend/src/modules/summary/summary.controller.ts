import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { addDays, nightsBetween, parseDate, todayHotel } from '../../lib/date.js';
import { decToNum, round2 } from '../../lib/money.js';

const DAY_MS = 86_400_000;

export async function summary(req: Request, res: Response): Promise<void> {
  const now = todayHotel();
  const companyId = req.user!.companyId;
  const to = req.query.to !== undefined ? parseDate(req.query.to, 'to') : now;
  const from =
    req.query.from !== undefined
      ? parseDate(req.query.from, 'from')
      : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));

  if (to < from) throw badRequest('"from" no puede ser posterior a "to"');

  const days = nightsBetween(from, addDays(to, 1));
  const toExclusive = addDays(to, 1);
  const dayIndex = (d: Date): number => {
    const i = Math.floor((d.getTime() - from.getTime()) / DAY_MS);
    return i >= 0 && i < days ? i : -1;
  };

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

  const occupiedPerDay = new Array<number>(days).fill(0);
  const bookedNights = new Map<number, Set<number>>();
  for (const r of reservations) {
    const set = bookedNights.get(r.roomId) ?? new Set<number>();
    for (let i = 0; i < days; i++) {
      const day = addDays(from, i);
      if (r.checkIn < addDays(day, 1) && r.checkOut > day) {
        set.add(i);
        occupiedPerDay[i] += 1;
      }
    }
    bookedNights.set(r.roomId, set);
  }

  const occupiedNights = [...bookedNights.values()].reduce((acc, s) => acc + s.size, 0);
  const totalRoomNights = activeRooms * days;
  const occupancyPct = totalRoomNights > 0 ? round2((occupiedNights / totalRoomNights) * 100) : 0;
  const occupancyPctPerDay =
    activeRooms > 0 ? occupiedPerDay.map((n) => round2((n / activeRooms) * 100)) : new Array<number>(days).fill(0);

  const [payments, statusGroup, createdReservations, checkInReservations, checkOutReservations] =
    await Promise.all([
      prisma.payment.findMany({
        where: { paidAt: { gte: from, lt: toExclusive }, reservation: { companyId } },
        select: { amount: true, method: true, paidAt: true },
      }),
      prisma.reservation.groupBy({
        by: ['status'],
        where: {
          status: { not: 'CANCELLED' },
          AND: [{ checkIn: { lt: toExclusive } }, { checkOut: { gt: from } }],
        },
        _count: { _all: true },
      }),
      prisma.reservation.findMany({
        where: { createdAt: { gte: from, lt: toExclusive } },
        select: { createdAt: true },
      }),
      prisma.reservation.findMany({
        where: { checkedInAt: { gte: from, lt: toExclusive } },
        select: { checkedInAt: true },
      }),
      prisma.reservation.findMany({
        where: { checkedOutAt: { gte: from, lt: toExclusive } },
        select: { checkedOutAt: true },
      }),
    ]);

  const createdCount = createdReservations.length;
  const checkIns = checkInReservations.length;
  const checkOuts = checkOutReservations.length;

  const revenue = round2(payments.reduce((acc, p) => acc + decToNum(p.amount), 0));
  const revenueByMethod = payments.reduce<Record<string, number>>((acc, p) => {
    acc[p.method] = round2((acc[p.method] ?? 0) + decToNum(p.amount));
    return acc;
  }, {});

  const revenuePerDay = new Array<number>(days).fill(0);
  for (const p of payments) {
    const i = dayIndex(p.paidAt);
    if (i >= 0) revenuePerDay[i] += decToNum(p.amount);
  }

  const createdPerDay = new Array<number>(days).fill(0);
  for (const r of createdReservations) {
    const i = dayIndex(r.createdAt);
    if (i >= 0) createdPerDay[i] += 1;
  }

  const checkInsPerDay = new Array<number>(days).fill(0);
  for (const r of checkInReservations) {
    if (!r.checkedInAt) continue;
    const i = dayIndex(r.checkedInAt);
    if (i >= 0) checkInsPerDay[i] += 1;
  }

  const checkOutsPerDay = new Array<number>(days).fill(0);
  for (const r of checkOutReservations) {
    if (!r.checkedOutAt) continue;
    const i = dayIndex(r.checkedOutAt);
    if (i >= 0) checkOutsPerDay[i] += 1;
  }

  const daily = Array.from({ length: days }, (_, i) => ({
    date: addDays(from, i).toISOString().slice(0, 10),
    revenue: round2(revenuePerDay[i]),
    created: createdPerDay[i],
    checkIns: checkInsPerDay[i],
    checkOuts: checkOutsPerDay[i],
    occupiedRoomNights: occupiedPerDay[i],
    occupancyPct: occupancyPctPerDay[i],
  }));

  res.json({
    data: {
      range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), days },
      occupancy: {
        occupancyPct,
        occupiedRoomNights: occupiedNights,
        availableRoomNights: Math.max(0, totalRoomNights - occupiedNights),
        totalRoomNights,
      },
      revenue: { total: revenue, byMethod: revenueByMethod },
      reservationsPage: { created: createdCount, checkIns, checkOuts },
      statusDistribution: statusGroup.map((g) => ({ status: g.status, count: g._count._all })),
      daily,
    },
  });
}
