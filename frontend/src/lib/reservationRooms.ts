import type { Room } from '../api/types';
import { round2 } from './format.ts';

export interface SelectedRoom {
  room: Room;
  persons: number;
  extraBeds: number;
}

export function selectedRoomsTotal(rooms: SelectedRoom[], nights: number): number {
  return round2(rooms.reduce((sum, line) => sum + line.room.price * nights * (line.room.pricingMode === 'PER_PERSON' ? line.persons : 1), 0));
}
