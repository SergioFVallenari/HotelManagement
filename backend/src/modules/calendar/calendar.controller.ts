import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { addDays, nightsBetween, parseDate, todayHotel } from '../../lib/date.js';

type CellStatus = 'AVAILABLE' | 'OCCUPIED' | 'TURNOVER';

interface ReservationRef {
  id: number;
  code: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestName: string;
}

const MAX_DAYS = 62;

const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

export async function calendar(req: Request, res: Response): Promise<void> {
  const now = todayHotel();
  const from =
    req.query.from !== undefined
      ? parseDate(req.query.from, 'from')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to =
    req.query.to !== undefined
      ? parseDate(req.query.to, 'to')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  if (to < from) throw badRequest('"from" no puede ser posterior a "to"');

  const totalDays = nightsBetween(from, addDays(to, 1));
  if (totalDays > MAX_DAYS) throw badRequest(`El rango no puede exceder ${MAX_DAYS} días`);

  const dayDates: Date[] = [];
  for (let i = 0; i < totalDays; i++) dayDates.push(addDays(from, i));

  const rooms = await prisma.room.findMany({
    orderBy: [{ isActive: 'desc' }, { number: 'asc' }],
    include: { type: true },
  });

  const reservations = await prisma.reservation.findMany({
    where: {
      status: { not: 'CANCELLED' },
      checkIn: { lte: to },
      checkOut: { gte: from },
    },
    select: {
      id: true,
      code: true,
      status: true,
      checkIn: true,
      checkOut: true,
      roomId: true,
      guest: { select: { firstName: true, lastName: true } },
    },
  });

  const byRoom = new Map<number, typeof reservations>();
  for (const reserve of reservations) {
    const list = byRoom.get(reserve.roomId) ?? [];
    list.push(reserve);
    byRoom.set(reserve.roomId, list);
  }

  const roomsData = rooms.map((room) => {
    const list = byRoom.get(room.id) ?? [];
    const cells = dayDates.map((day) => {
      const occupied: ReservationRef[] = [];
      const checkIns: ReservationRef[] = [];
      const checkOuts: ReservationRef[] = [];

      for (const reserve of list) {
        const ref: ReservationRef = {
          id: reserve.id,
          code: reserve.code,
          status: reserve.status,
          checkIn: dateKey(reserve.checkIn),
          checkOut: dateKey(reserve.checkOut),
          guestName: `${reserve.guest.firstName} ${reserve.guest.lastName}`.trim(),
        };
        if (reserve.checkIn <= day && day < reserve.checkOut) occupied.push(ref);
        if (dateKey(reserve.checkIn) === dateKey(day)) checkIns.push(ref);
        if (dateKey(reserve.checkOut) === dateKey(day)) checkOuts.push(ref);
      }

      let status: CellStatus = 'AVAILABLE';
      let refs: ReservationRef[] = [];
      if (checkIns.length > 0 && checkOuts.length > 0) {
        status = 'TURNOVER';
        refs = [...checkOuts, ...checkIns];
      } else if (occupied.length > 0) {
        status = 'OCCUPIED';
        refs = occupied;
      }

      return { status, reservations: refs };
    });

    return {
      id: room.id,
      number: room.number,
      name: room.name,
      typeName: room.type?.name ?? null,
      cells,
    };
  });

  res.json({
    data: {
      from: dateKey(from),
      to: dateKey(to),
      days: dayDates.map(dateKey),
      rooms: roomsData,
    },
  });
}