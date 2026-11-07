import { prisma } from '../../config/prisma.js';
import { badRequest } from '../../lib/AppError.js';
import { decToNum } from '../../lib/money.js';
import { getTenantId } from '../../lib/tenant.js';
import { validateRoomSelections, type RoomSelection, type RoomSnapshot } from '../../lib/reservationRooms.js';

export async function loadReservationRooms(selections: RoomSelection[], snapshots?: RoomSnapshot[]) {
  const rooms = await prisma.room.findMany({
    where: { id: { in: selections.map((line) => line.roomId) }, companyId: getTenantId()!, isActive: true },
    include: { type: true },
  });
  const error = validateRoomSelections(selections, rooms);
  if (error) throw badRequest(error);
  return selections.map((line): RoomSnapshot => {
    const room = rooms.find((item) => item.id === line.roomId)!;
    const snapshot = snapshots?.find((item) => item.roomId === room.id);
    return { ...line, roomPrice: snapshot?.roomPrice ?? decToNum(room.price), roomPricingMode: snapshot?.roomPricingMode ?? room.pricingMode, number: room.number, typeName: room.type.name, capacity: room.capacity };
  });
}

export function roomOverlapWhere(roomIds: number[]) {
  return { OR: [{ roomId: { in: roomIds } }, { rooms: { some: { roomId: { in: roomIds } } } }] };
}
