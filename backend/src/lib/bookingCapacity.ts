export function availabilityPersonsLimit(hotelCapacity: number, configured?: number | null): number {
  return Math.min(hotelCapacity, configured ?? hotelCapacity);
}
