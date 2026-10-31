import { round2 } from './money.js';
import { roomStayTotal, type RoomPricingMode } from './pricing.js';

export interface RoomSelection {
  roomId: number;
  persons: number;
  extraBeds: number;
}

export interface RoomSnapshot extends RoomSelection {
  roomPrice: number;
  roomPricingMode: RoomPricingMode;
  number: string;
  typeName: string;
  capacity: number;
}

export function validateRoomSelections(selections: RoomSelection[], rooms: { id: number; capacity: number; maxExtraBeds: number }[]): string | null {
  if (!selections.length) return 'Seleccioná al menos una habitación';
  if (new Set(selections.map((line) => line.roomId)).size !== selections.length) return 'No se puede seleccionar dos veces la misma habitación';
  for (const line of selections) {
    const room = rooms.find((item) => item.id === line.roomId);
    if (!room) return 'Una de las habitaciones no está disponible en este alojamiento';
    if (!Number.isInteger(line.persons) || line.persons < 1 || line.persons > room.capacity) return `La habitación admite entre 1 y ${room.capacity} personas`;
    if (!Number.isInteger(line.extraBeds) || line.extraBeds < 0 || line.extraBeds > room.maxExtraBeds) return `La habitación admite hasta ${room.maxExtraBeds} cama(s) extra(s)`;
    if (line.extraBeds > 0 && line.persons < room.capacity) return 'Las camas extras solo pueden cargarse cuando la habitación está llena';
  }
  return null;
}

export function roomSelectionsTotal(rooms: Pick<RoomSnapshot, 'roomPrice' | 'roomPricingMode' | 'persons'>[], nights: number): number {
  return round2(rooms.reduce((sum, room) => sum + roomStayTotal(room.roomPricingMode, room.roomPrice, nights, room.persons), 0));
}
