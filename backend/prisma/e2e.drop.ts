import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { createClient } from '@supabase/supabase-js';

const GUEST_EMAIL = 'e2e-booking@test.local';
const ROOM_NUMBER = 'E2E-1';
const TYPE_NAME = 'E2E';
const SERVICE_NAME = 'E2E Desayuno';

const company = await prisma.company.findUnique({
  where: { name: 'Hotel Principal' },
  select: { id: true },
});
if (!company) throw new Error('No existe Hotel Principal');

const guest = await prisma.guest.findFirst({
  where: { companyId: company.id, email: GUEST_EMAIL },
  select: { id: true },
});

const reservations = await prisma.reservation.findMany({
  where: { companyId: company.id, guestId: guest?.id ?? -1 },
  select: { id: true, code: true },
});
const reservationIds = reservations.map((r) => r.id);

const receipts = await prisma.reservationReceipt.findMany({
  where: { reservationId: { in: reservationIds } },
  select: { storagePath: true },
});

const links = await prisma.bookingLink.findMany({
  where: { companyId: company.id, room: { number: ROOM_NUMBER } },
  select: { id: true, token: true },
});

console.log('reservas:', reservations.map((r) => r.code).join(', ') || '(ninguna)');
console.log('links:', links.map((l) => l.token).join(', ') || '(ninguno)');
console.log('comprobantes:', receipts.map((r) => r.storagePath).join(', ') || '(ninguno)');

await prisma.payment.deleteMany({ where: { reservationId: { in: reservationIds } } });
await prisma.reservationService.deleteMany({ where: { reservationId: { in: reservationIds } } });
await prisma.reservationReceipt.deleteMany({ where: { reservationId: { in: reservationIds } } });
await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
await prisma.bookingLink.deleteMany({ where: { id: { in: links.map((l) => l.id) } } });
if (guest) await prisma.guest.deleteMany({ where: { id: guest.id } });

const room = await prisma.room.findFirst({
  where: { companyId: company.id, number: ROOM_NUMBER },
  select: { id: true },
});
if (room) {
  await prisma.reservation.deleteMany({ where: { roomId: room.id } });
  await prisma.bookingLink.deleteMany({ where: { roomId: room.id } });
  await prisma.room.deleteMany({ where: { id: room.id } });
}

const type = await prisma.roomType.findFirst({
  where: { companyId: company.id, name: TYPE_NAME },
  select: { id: true },
});
if (type) {
  const rooms = await prisma.room.count({ where: { typeId: type.id } });
  if (rooms === 0) await prisma.roomType.deleteMany({ where: { id: type.id } });
}

await prisma.service.deleteMany({ where: { companyId: company.id, name: SERVICE_NAME } });

if (receipts.length > 0) {
  const storage = createClient(env.supabase.url, env.supabase.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await storage.storage
    .from('booking-receipts')
    .remove(receipts.map((r) => r.storagePath));
  console.log('storage:', error ? `error ${error.message}` : 'objeto eliminado');
}

const left = await prisma.bookingLink.count({ where: { companyId: company.id } });
console.log('links restantes en el hotel:', left);
process.exit(0);
