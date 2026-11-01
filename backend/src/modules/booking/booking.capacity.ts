import { prisma } from '../../config/prisma.js';
import { publicAvailabilityLimits } from '../../lib/bookingCapacity.js';
import { publicPageConfigSchema } from '../companies/companies.schema.js';
import { decToNum } from '../../lib/money.js';

export async function getBookingCapacity(companyId: number, configPage: unknown) {
  const rooms = await prisma.room.aggregate({
    where: { companyId, isActive: true },
    _count: { _all: true },
    _sum: { capacity: true, maxExtraBeds: true },
  });
  const hotelCapacity = rooms._sum.capacity ?? 0;
  const config = publicPageConfigSchema.safeParse(configPage);
  const extraBeds = config.success ? config.data.publicExtraBeds : undefined;
  const service = extraBeds?.enabled && extraBeds.serviceId ? await prisma.service.findFirst({
    where: { id: extraBeds.serviceId, companyId, isActive: true, isExtraBed: true },
    select: { name: true, price: true, chargeType: true },
  }) : null;
  const hotelCapacityWithExtraBeds = hotelCapacity + (rooms._sum.maxExtraBeds ?? 0);
  const configuredLimit = config.success ? config.data.maxAvailabilityPersons : null;
  return {
    hotelCapacity,
    hotelCapacityWithExtraBeds,
    publicExtraBedsEnabled: service !== null,
    publicExtraBedService: service ? { ...service, price: decToNum(service.price) } : null,
    roomCount: rooms._count._all,
    ...publicAvailabilityLimits(hotelCapacity, rooms._sum.maxExtraBeds ?? 0, service !== null, configuredLimit),
  };
}
