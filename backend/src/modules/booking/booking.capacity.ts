import { prisma } from '../../config/prisma.js';
import { availabilityPersonsLimit } from '../../lib/bookingCapacity.js';
import { publicPageConfigSchema } from '../companies/companies.schema.js';

export async function getBookingCapacity(companyId: number, configPage: unknown) {
  const rooms = await prisma.room.aggregate({
    where: { companyId, isActive: true },
    _sum: { capacity: true },
  });
  const hotelCapacity = rooms._sum.capacity ?? 0;
  const config = publicPageConfigSchema.safeParse(configPage);
  return {
    hotelCapacity,
    maxAvailabilityPersons: availabilityPersonsLimit(hotelCapacity, config.success ? config.data.maxAvailabilityPersons : null),
  };
}
