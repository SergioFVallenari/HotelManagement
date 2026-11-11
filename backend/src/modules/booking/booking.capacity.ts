import { prisma } from '../../config/prisma.js';
import { publicAvailabilityLimits, type summarizeRoomCapacity } from '../../lib/bookingCapacity.js';
import { publicPageConfigSchema } from '../companies/companies.schema.js';
import { decToNum } from '../../lib/money.js';

export async function getBookingCapacity(companyId: number, configPage: unknown, roomTypeId?: number, roomSummary?: Promise<ReturnType<typeof summarizeRoomCapacity>>) {
  const config = publicPageConfigSchema.safeParse(configPage);
  const extraBeds = config.success ? config.data.publicExtraBeds : undefined;
  const publicIds = config.success ? config.data.publicServiceIds ?? [] : [];
  const extraBedId = extraBeds?.enabled ? extraBeds.serviceId : null;
  const ids = [...new Set([...publicIds, ...(extraBedId ? [extraBedId] : [])])];
  const [rooms, services] = await Promise.all([
    roomSummary ?? prisma.room.aggregate({
      where: { companyId, isActive: true, ...(roomTypeId !== undefined ? { typeId: roomTypeId } : {}) },
      _count: { _all: true },
      _sum: { capacity: true, maxExtraBeds: true },
    }).then((rooms) => ({ roomCount: rooms._count._all, capacity: rooms._sum.capacity ?? 0, extraBeds: rooms._sum.maxExtraBeds ?? 0 })),
    ids.length ? prisma.service.findMany({
      where: { companyId, id: { in: ids }, isActive: true },
      select: { id: true, name: true, description: true, intervalDays: true, price: true, chargeType: true, isExtraBed: true },
      orderBy: { name: 'asc' },
    }) : Promise.resolve([]),
  ]);
  const publicServices = services.filter((service) => !service.isExtraBed && publicIds.includes(service.id));
  const service = services.find((service) => service.id === extraBedId && service.isExtraBed);
  const hotelCapacity = rooms.capacity;
  const hotelCapacityWithExtraBeds = hotelCapacity + rooms.extraBeds;
  const publicExtraBedService = service && service.chargeType !== 'PER_ROOM_INTERVAL' ? { name: service.name, chargeType: service.chargeType, price: decToNum(service.price) } : null;
  const configuredLimit = config.success ? config.data.maxAvailabilityPersons : null;
  return {
    hotelCapacity,
    publicServices: publicServices.map(({ isExtraBed: _isExtraBed, ...service }) => ({ ...service, price: decToNum(service.price) })),
    hotelCapacityWithExtraBeds,
    publicExtraBedsEnabled: publicExtraBedService !== null,
    publicExtraBedService,
    roomCount: rooms.roomCount,
    ...publicAvailabilityLimits(hotelCapacity, rooms.extraBeds, publicExtraBedService !== null, configuredLimit),
  };
}
