import { prisma } from '../src/config/prisma.js';

const TAG = process.env.BENCH_TAG ?? 'BENCH';
const ROOM_PREFIX = `${TAG}-`;
const GUEST_PREFIX = 'bench-';
const COMPANY = process.env.BENCH_COMPANY ?? 'Hotel Principal';

// El REST no alcanza para purgar: /reservations no expone DELETE, guests
// tampoco, y cancelar una reserva deja la fila, cuyo FK bloquea el DELETE de la
// habitacion. Asi que se va directo por Prisma.
//
// Corriendo aca no pasa por withTenant, asi que companyId va explicito.
const company = await prisma.company.findUnique({ where: { name: COMPANY }, select: { id: true, name: true } });
if (!company) throw new Error(`No existe la empresa "${COMPANY}".`);

const benchGuests = { email: { startsWith: GUEST_PREFIX } };
const benchReservations = { guest: benchGuests };

const payments = await prisma.payment.deleteMany({ where: { reservation: benchReservations } });
const services = await prisma.reservationService.deleteMany({ where: { reservation: benchReservations } });
const reservations = await prisma.reservation.deleteMany({ where: benchReservations });
const guests = await prisma.guest.deleteMany({ where: benchGuests });

// Las primeras versiones del bench numeraban las habitaciones B<timestamp>-<i>
// en vez de BENCH-<i>, asi que hay que cubrir las dos formas. El prefijo solo no
// alcanza ("B1" seria una habitacion legitima), asi que el segundo patron se
// filtra con regex sobre los candidatos.
const legacyRoom = /^B\d{9,}-\d+$/;
const roomCandidates = await prisma.room.findMany({
  where: { number: { startsWith: ROOM_PREFIX.slice(0, 1) } },
  select: { id: true, number: true },
});
const roomIds = roomCandidates.filter((r) => r.number.startsWith(ROOM_PREFIX) || legacyRoom.test(r.number)).map((r) => r.id);

const rooms = await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
const types = await prisma.roomType.deleteMany({ where: { name: { startsWith: TAG } } });

console.log(
  `Purgado en "${company.name}": ${payments.count} pagos, ${services.count} servicios, ` +
    `${reservations.count} reservas, ${guests.count} huespedes, ${rooms.count} habitaciones, ${types.count} tipos.`,
);

await prisma.$disconnect();
