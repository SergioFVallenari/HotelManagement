import { allocateAvailableRooms, type AvailableRoom, type AvailabilityExtraBedService } from './availability.js';
import { quoteAvailabilityServices, type PublicService } from './availabilityServices.js';
import { round2 } from './money.js';

interface AvailabilityChoiceInput {
  rooms: (AvailableRoom & { typeId: number; id?: number })[];
  selectedRoomId?: number;
  persons: number;
  nights: number;
  roomCount?: number;
  roomPersons?: number[];
  extraBedService?: AvailabilityExtraBedService;
  publicServices: PublicService[];
  services: { serviceId: number; quantity?: number }[];
}

export function quoteAvailabilityChoices(input: AvailabilityChoiceInput) {
  const availableRooms = input.selectedRoomId !== undefined ? input.rooms.filter((room) => room.id === input.selectedRoomId) : input.rooms;
  function quote(rooms: AvailableRoom[]) {
    const allocation = allocateAvailableRooms(rooms, input.persons, input.nights, input.selectedRoomId !== undefined ? 1 : input.roomCount, input.roomPersons, input.extraBedService);
    const services = quoteAvailabilityServices(input.publicServices, input.services, input.persons, input.nights, allocation?.roomCount ?? 0);
    const extraBeds = allocation?.rooms.reduce((sum, room) => sum + room.extraBeds, 0) ?? 0;
    return {
      ...services,
      combination: allocation ? {
        ...allocation,
        total: round2(allocation.total + services.servicesTotal),
        extraBeds,
        roomTotal: round2(allocation.rooms.reduce((sum, room) => sum + room.roomTotal, 0)),
        extraBedsTotal: round2(allocation.rooms.reduce((sum, room) => sum + room.extraBedsTotal, 0)),
        extraBedService: extraBeds > 0 ? input.extraBedService ?? null : null,
      } : null,
    };
  }

  const grouped = new Map<number, AvailabilityChoiceInput['rooms']>();
  for (const room of availableRooms) {
    const group = grouped.get(room.typeId) ?? [];
    group.push(room);
    grouped.set(room.typeId, group);
  }
  return {
    ...quote(availableRooms),
    options: input.selectedRoomId !== undefined ? [] : [...grouped.values()].flatMap((rooms) => {
      const option = quote(rooms);
      const combination = option.combination;
      if (!combination) return [];
      return [{
        roomType: rooms[0]!.roomType,
        available: rooms.length,
        capacity: Math.max(...rooms.map((room) => room.capacity)),
        fromPrice: Math.min(...rooms.map((room) => room.price)),
        roomCount: combination.roomCount,
        roomTotal: combination.roomTotal,
        total: combination.total,
        amenities: [...new Set(combination.rooms.flatMap((room) => room.amenities))],
        ...option,
        combination,
      }];
    }),
  };
}
