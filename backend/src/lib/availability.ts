import { round2 } from './money.js';
import { roomStayTotal, type RoomPricingMode } from './pricing.js';

export interface AvailableRoom {
  roomType: string;
  capacity: number;
  price: number;
  pricingMode: RoomPricingMode;
}

interface RoomAllocation {
  roomType: string;
  capacity: number;
  persons: number;
  total: number;
}

interface AllocationState {
  roomCount: number;
  total: number;
  room: RoomAllocation | null;
  previous: AllocationState | null;
}

export function allocateAvailableRooms(rooms: AvailableRoom[], persons: number, nights: number, requestedRoomCount?: number) {
  if (persons < 1 || rooms.reduce((sum, room) => sum + room.capacity, 0) < persons) return null;
  if (requestedRoomCount && (requestedRoomCount > rooms.length || requestedRoomCount > persons)) return null;
  let states = new Map<string, AllocationState>([['0:0', { roomCount: 0, total: 0, room: null, previous: null }]]);

  for (const room of rooms) {
    const next = new Map(states);
    for (const [key, state] of states) {
      const covered = Number(key.split(':')[0]);
      if (requestedRoomCount && state.roomCount >= requestedRoomCount) continue;
      for (let assigned = 1; assigned <= Math.min(room.capacity, persons - covered); assigned++) {
        const roomTotal = roomStayTotal(room.pricingMode, room.price, nights, assigned);
        const total = round2(state.total + roomTotal);
        const roomCount = state.roomCount + 1;
        const nextKey = `${covered + assigned}:${requestedRoomCount ? roomCount : 0}`;
        const current = next.get(nextKey);
        if (current && (current.roomCount < roomCount || (current.roomCount === roomCount && current.total <= total))) continue;
        next.set(nextKey, {
          roomCount,
          total,
          room: { roomType: room.roomType, capacity: room.capacity, persons: assigned, total: roomTotal },
          previous: state,
        });
      }
    }
    states = next;
  }

  const best = [...states.entries()].filter(([key, state]) => Number(key.split(':')[0]) === persons && (!requestedRoomCount || state.roomCount === requestedRoomCount)).map(([, state]) => state).sort((a, b) => a.roomCount - b.roomCount || a.total - b.total)[0];
  if (!best) return null;
  const allocation: RoomAllocation[] = [];
  for (let state: AllocationState | null = best; state?.room; state = state.previous) {
    allocation.push(state.room);
  }
  return { roomCount: best.roomCount, persons, total: best.total, rooms: allocation.reverse() };
}
