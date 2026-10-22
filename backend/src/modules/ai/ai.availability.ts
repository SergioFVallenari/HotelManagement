import { addDays } from '../../lib/date.js';

export const AI_AVAILABILITY_DAYS = 30;

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export interface AvailabilityRoom {
  id: number;
  typeName: string;
  capacity: number;
}

export interface AvailabilityReservation {
  roomId: number;
  checkIn: Date;
  checkOut: Date;
  status: string;
}

export interface AiAvailabilityType {
  name: string;
  capacity: number;
  free: number;
  total: number;
}

export interface AiAvailabilityDay {
  date: string;
  weekday: string;
  types: AiAvailabilityType[];
}

export interface AiDayLabel {
  date: string;
  weekday: string;
}

export function describeDay(date: Date): AiDayLabel {
  return {
    date: date.toISOString().slice(0, 10),
    weekday: WEEKDAYS[date.getUTCDay()],
  };
}

// Una reserva ocupa las noches con checkIn <= noche < checkOut (el dia del
// check-out no ocupa), igual que el calendario. Devuelve las habitaciones
// libres por tipo para cada noche de la ventana.
export function buildAvailability(
  rooms: AvailabilityRoom[],
  reservations: AvailabilityReservation[],
  from: Date,
  days: number = AI_AVAILABILITY_DAYS,
): AiAvailabilityDay[] {
  const byType = new Map<string, { capacity: number; roomIds: number[] }>();
  for (const room of rooms) {
    const entry = byType.get(room.typeName);
    if (entry) {
      entry.roomIds.push(room.id);
      entry.capacity = Math.max(entry.capacity, room.capacity);
    } else {
      byType.set(room.typeName, { capacity: room.capacity, roomIds: [room.id] });
    }
  }

  const active = reservations.filter((reservation) => reservation.status !== 'CANCELLED');

  const result: AiAvailabilityDay[] = [];
  for (let index = 0; index < days; index += 1) {
    const day = addDays(from, index);
    const occupied = new Set<number>();
    for (const reservation of active) {
      if (reservation.checkIn <= day && day < reservation.checkOut) {
        occupied.add(reservation.roomId);
      }
    }

    const types = [...byType.entries()]
      .map(([name, info]) => ({
        name,
        capacity: info.capacity,
        free: info.roomIds.filter((roomId) => !occupied.has(roomId)).length,
        total: info.roomIds.length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));

    result.push({ ...describeDay(day), types });
  }

  return result;
}
