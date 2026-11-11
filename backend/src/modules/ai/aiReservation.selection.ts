import { roomStayTotal, type RoomPricingMode } from '../../lib/pricing.js';

interface RequestedRoom { number: string | null; type: string | null; persons: number; extraBeds: number }
interface CandidateRoom { id: number; number: string; typeName: string; capacity: number; maxExtraBeds: number; price: number; pricingMode: RoomPricingMode }
export const normalizeAiText = (value: string) => value.trim().normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('es');

export function selectAiRooms(requests: RequestedRoom[], rooms: CandidateRoom[], nights: number): CandidateRoom[] | null {
  const candidates = requests.map((requested) => rooms.filter((room) =>
    (!requested.number || normalizeAiText(room.number) === normalizeAiText(requested.number))
    && (!requested.type || normalizeAiText(room.typeName) === normalizeAiText(requested.type))
    && requested.extraBeds <= room.maxExtraBeds && requested.extraBeds < requested.persons
    && requested.persons - requested.extraBeds <= room.capacity
    && (requested.extraBeds === 0 || requested.persons - requested.extraBeds === room.capacity))
    .sort((a, b) => roomStayTotal(a.pricingMode, a.price, nights, requested.persons - requested.extraBeds) - roomStayTotal(b.pricingMode, b.price, nights, requested.persons - requested.extraBeds)));
  const assigned = new Map<number, number>();
  function match(slot: number, visited: Set<number>): boolean {
    for (const room of candidates[slot]!) {
      if (visited.has(room.id)) continue;
      visited.add(room.id);
      const previous = assigned.get(room.id);
      if (previous === undefined || match(previous, visited)) {
        assigned.set(room.id, slot);
        return true;
      }
    }
    return false;
  }
  const order = requests.map((_, index) => index).sort((a, b) => candidates[a]!.length - candidates[b]!.length);
  for (const slot of order) if (!match(slot, new Set())) return null;
  const result: CandidateRoom[] = Array(requests.length);
  for (const [id, slot] of assigned) result[slot] = rooms.find((room) => room.id === id)!;
  return result;
}
