export function availabilityPersonsLimit(hotelCapacity: number, configured?: number | null): number {
  return Math.min(hotelCapacity, configured ?? hotelCapacity);
}

export function publicAvailabilityLimits(baseCapacity: number, extraBeds: number, enabled: boolean, configured?: number | null) {
  return {
    maxAvailabilityPersons: availabilityPersonsLimit(baseCapacity, configured),
    maxAvailabilityPersonsWithExtraBeds: availabilityPersonsLimit(baseCapacity + (enabled ? extraBeds : 0), configured),
  };
}
