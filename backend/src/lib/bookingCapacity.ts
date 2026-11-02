export function availabilityPersonsLimit(hotelCapacity: number, configured?: number | null): number {
  return Math.min(hotelCapacity, configured ?? hotelCapacity);
}

export function publicAvailabilityLimits(baseCapacity: number, extraBeds: number, enabled: boolean, configured?: number | null) {
  return {
    maxAvailabilityPersons: availabilityPersonsLimit(baseCapacity, configured),
    maxAvailabilityPersonsWithExtraBeds: availabilityPersonsLimit(baseCapacity + (enabled ? extraBeds : 0), configured),
  };
}

export function publicRoomTypeOptions(types: { id: number; name: string; rooms: { capacity: number; maxExtraBeds: number }[] }[], extraBedsEnabled: boolean, configuredLimit?: number | null) {
  return types.filter((type) => type.rooms.length > 0).map((type) => ({
    id: type.id,
    name: type.name,
    roomCount: type.rooms.length,
    ...publicAvailabilityLimits(
      type.rooms.reduce((sum, room) => sum + room.capacity, 0),
      type.rooms.reduce((sum, room) => sum + room.maxExtraBeds, 0),
      extraBedsEnabled,
      configuredLimit,
    ),
  }));
}
