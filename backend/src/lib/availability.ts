import { round2 } from './money.js';
import { roomStayTotal, serviceQuantity, type RoomPricingMode } from './pricing.js';

export interface AvailableRoom {
  roomType: string;
  capacity: number;
  price: number;
  pricingMode: RoomPricingMode;
  amenities?: string[];
  maxExtraBeds?: number;
}

export interface AvailabilityExtraBedService {
  name: string;
  price: number;
  chargeType: 'PER_DAY' | 'PER_PERSON' | 'PACK';
}

function roomCapacity(room: AvailableRoom, service?: AvailabilityExtraBedService) {
  return room.capacity + (service ? room.maxExtraBeds ?? 0 : 0);
}

function quoteRoom(room: AvailableRoom, persons: number, nights: number, service?: AvailabilityExtraBedService) {
  const extraBeds = Math.max(0, persons - room.capacity);
  const basePersons = persons - extraBeds;
  const roomTotal = roomStayTotal(room.pricingMode, room.price, nights, basePersons);
  const quantity = extraBeds && service ? serviceQuantity(service.chargeType, { persons: basePersons, extraBeds, nights }, service.chargeType === 'PER_DAY' ? undefined : extraBeds, true) : 0;
  const extraBedsTotal = round2(quantity * (service?.price ?? 0));
  return { roomType: room.roomType, capacity: room.capacity, persons, extraBeds, roomTotal, extraBedsTotal, total: round2(roomTotal + extraBedsTotal), amenities: room.amenities ?? [] };
}

interface RoomAllocation {
  roomType: string;
  capacity: number;
  persons: number;
  total: number;
  amenities: string[];
  extraBeds: number;
  roomTotal: number;
  extraBedsTotal: number;
}

interface AllocationState {
  roomCount: number;
  total: number;
  room: RoomAllocation | null;
  previous: AllocationState | null;
}

function allocateRoomDistribution(rooms: AvailableRoom[], distribution: number[], nights: number, service?: AvailabilityExtraBedService) {
  if (distribution.length > rooms.length || distribution.some((count) => !Number.isSafeInteger(count) || count < 1)) return null;
  const potentials = Array(distribution.length + 1).fill(0) as number[];
  const roomPotentials = Array(rooms.length + 1).fill(0) as number[];
  const matched = Array(rooms.length + 1).fill(0) as number[];
  const previous = Array(rooms.length + 1).fill(0) as number[];
  for (let slot = 1; slot <= distribution.length; slot++) {
    matched[0] = slot;
    let current = 0;
    const distances = Array(rooms.length + 1).fill(Infinity) as number[];
    const used = Array(rooms.length + 1).fill(false) as boolean[];
    do {
      used[current] = true;
      const activeSlot = matched[current]!;
      const persons = distribution[activeSlot - 1]!;
      let delta = Infinity;
      let next = 0;
      for (let candidate = 1; candidate <= rooms.length; candidate++) {
        if (used[candidate]) continue;
        const room = rooms[candidate - 1]!;
        const cost = roomCapacity(room, service) >= persons ? quoteRoom(room, persons, nights, service).total : Infinity;
        const distance = cost - potentials[activeSlot]! - roomPotentials[candidate]!;
        if (distance < distances[candidate]!) {
          distances[candidate] = distance;
          previous[candidate] = current;
        }
        if (distances[candidate]! < delta) {
          delta = distances[candidate]!;
          next = candidate;
        }
      }
      if (!Number.isFinite(delta)) return null;
      for (let candidate = 0; candidate <= rooms.length; candidate++) {
        if (used[candidate]) {
          potentials[matched[candidate]!]! += delta;
          roomPotentials[candidate]! -= delta;
        } else distances[candidate]! -= delta;
      }
      current = next;
    } while (matched[current] !== 0);
    do {
      const next = previous[current]!;
      matched[current] = matched[next]!;
      current = next;
    } while (current !== 0);
  }
  const allocation: RoomAllocation[] = Array(distribution.length);
  for (let candidate = 1; candidate <= rooms.length; candidate++) {
    const slot = matched[candidate]!;
    if (!slot) continue;
    const room = rooms[candidate - 1]!;
    const persons = distribution[slot - 1]!;
    allocation[slot - 1] = quoteRoom(room, persons, nights, service);
  }
  return { roomCount: distribution.length, persons: distribution.reduce((sum, count) => sum + count, 0), total: round2(allocation.reduce((sum, room) => sum + room.total, 0)), rooms: allocation };
}

export function allocateAvailableRooms(rooms: AvailableRoom[], persons: number, nights: number, requestedRoomCount?: number, roomPersons?: number[], service?: AvailabilityExtraBedService) {
  if (roomPersons) {
    if (!roomPersons.length || roomPersons.length !== requestedRoomCount || roomPersons.reduce((sum, count) => sum + count, 0) !== persons) return null;
    return allocateRoomDistribution(rooms, roomPersons, nights, service);
  }
  if (persons < 1 || rooms.reduce((sum, room) => sum + roomCapacity(room, service), 0) < persons) return null;
  if (requestedRoomCount && (requestedRoomCount > rooms.length || requestedRoomCount > persons)) return null;
  let states = new Map<string, AllocationState>([['0:0', { roomCount: 0, total: 0, room: null, previous: null }]]);

  for (const room of rooms) {
    const next = new Map(states);
    for (const [key, state] of states) {
      const covered = Number(key.split(':')[0]);
      if (requestedRoomCount && state.roomCount >= requestedRoomCount) continue;
      for (let assigned = 1; assigned <= Math.min(roomCapacity(room, service), persons - covered); assigned++) {
        const allocation = quoteRoom(room, assigned, nights, service);
        const total = round2(state.total + allocation.total);
        const roomCount = state.roomCount + 1;
        const nextKey = `${covered + assigned}:${requestedRoomCount ? roomCount : 0}`;
        const current = next.get(nextKey);
        if (current && (current.roomCount < roomCount || (current.roomCount === roomCount && current.total <= total))) continue;
        next.set(nextKey, {
          roomCount,
          total,
          room: allocation,
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
