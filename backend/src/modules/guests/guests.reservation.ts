import type { prisma } from '../../config/prisma.js';
import type { CreateGuestInput } from './guests.schema.js';
import { reservationGuestWrite } from '../../lib/guestIdentity.js';

export async function resolveReservationGuest(tx: Pick<typeof prisma, 'guest'>, companyId: number, guest: CreateGuestInput) {
  const write = reservationGuestWrite(companyId, guest);
  if (write.kind === 'create') {
    return tx.guest.create({ data: write.data, select: { id: true } });
  }
  return tx.guest.upsert({
    where: write.where,
    update: write.update,
    create: write.create,
    select: { id: true },
  });
}
