import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { addDays, nightsBetween, parseDate, todayHotel } from '../../lib/date.js';
import { calendarCells, calendarRoomIds } from '../../lib/calendar.js';

const MAX_DAYS = 62;

const dateKey = (d: Date): string => d.toISOString().slice(0, 10);

export async function getCalendar(options: { from?: unknown; to?: unknown; companyId?: number; roomTypeId?: number; publicView?: boolean; roomTypeName?: string } = {}) {
  const now = todayHotel();
  const from =
    options.from !== undefined
      ? parseDate(options.from, 'from')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to =
    options.to !== undefined
      ? parseDate(options.to, 'to')
      : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

  if (to < from) throw badRequest('"from" no puede ser posterior a "to"');

  const totalDays = nightsBetween(from, addDays(to, 1));
  if (totalDays > MAX_DAYS) throw badRequest(`El rango no puede exceder ${MAX_DAYS} días`);

  const dayDates: Date[] = [];
  for (let i = 0; i < totalDays; i++) dayDates.push(addDays(from, i));

  const roomWhere = {
    ...(options.companyId !== undefined ? { companyId: options.companyId } : {}),
    ...(options.roomTypeId !== undefined ? { typeId: options.roomTypeId } : {}),
    ...(options.publicView ? { isActive: true } : {}),
  };
  const [rooms, reservations] = await Promise.all([
    prisma.room.findMany({
      where: roomWhere,
      orderBy: [{ isActive: 'desc' }, { number: 'asc' }],
      select: { id: true, number: true, name: true, capacity: true, maxExtraBeds: true, type: options.roomTypeName === undefined ? { select: { name: true } } : false },
    }),
    prisma.reservation.findMany({
      where: {
        ...(options.companyId !== undefined ? { companyId: options.companyId } : {}),
        status: options.publicView ? { in: ['PENDING', 'RESERVED', 'CHECKED_IN'] } : { not: 'CANCELLED' },
        ...(options.publicView ? { OR: [{ room: roomWhere }, { rooms: { some: { room: roomWhere } } }] } : {}),
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
        rooms: { select: { roomId: true } },
        guest: options.publicView ? false : { select: { firstName: true, lastName: true } },
      },
    }),
  ]);

  const byRoom = new Map<number, typeof reservations>();
  for (const reserve of reservations) {
    for (const roomId of calendarRoomIds(reserve)) {
      const list = byRoom.get(roomId) ?? [];
      list.push(reserve);
      byRoom.set(roomId, list);
    }
  }

  const roomsData = rooms.map((room) => {
    const list = byRoom.get(room.id) ?? [];
    const cells = calendarCells(dayDates.map(dateKey), list.map((reserve) => ({
      id: reserve.id, code: reserve.code, status: reserve.status,
      checkIn: dateKey(reserve.checkIn), checkOut: dateKey(reserve.checkOut),
      guestName: reserve.guest ? `${reserve.guest.firstName} ${reserve.guest.lastName}`.trim() : '',
    })));

    return {
      id: room.id,
      number: room.number,
      name: room.name,
      capacity: room.capacity,
      maxExtraBeds: room.maxExtraBeds,
      typeName: options.roomTypeName ?? room.type?.name ?? null,
      cells,
    };
  });

  return {
    from: dateKey(from),
    to: dateKey(to),
    days: dayDates.map(dateKey),
    rooms: roomsData,
  };
}
