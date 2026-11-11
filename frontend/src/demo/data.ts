import type { Guest, Reservation, Room, RoomType, Service, User } from '../api/types.ts';
import { round2 } from '../lib/format.ts';
import { computeBookingDeposit } from '../lib/pricing.ts';

export const demoUser: User = {
  id: 1, username: 'demo', role: 'OWNER', name: 'Recepción Demo',
  email: 'recepcion@hotel-demo.example', companyId: 1, companyName: 'Hotel Aurora · Demo',
};

export function shiftDay(day: string, offset: number): string {
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dayRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 366; day = shiftDay(day, 1)) days.push(day);
  return days;
}

export function updateTotals(reservation: Reservation): void {
  const amountPaid = round2(reservation.payments.reduce((sum, payment) => sum + payment.amount, 0));
  reservation.totals.amountPaid = amountPaid;
  reservation.totals.balance = round2(reservation.totals.total - amountPaid);
}

export function createDemoData(today: string) {
  const roomTypes: RoomType[] = [{ id: 1, name: 'Doble' }, { id: 2, name: 'Triple' }, { id: 3, name: 'Familiar' }];
  const rooms: Room[] = Array.from({ length: 12 }, (_, index) => {
    const type = roomTypes[Math.floor(index / 4)];
    return {
      id: index + 1, number: String(101 + index), name: index % 3 === 0 ? 'Vista al jardín' : null,
      typeId: type.id, type, capacity: type.id + 1, maxExtraBeds: type.id === 3 ? 1 : 0,
      price: [68000, 85000, 110000][type.id - 1], pricingMode: 'PER_NIGHT',
      amenities: ['Wi-Fi', 'Aire acondicionado', ...(type.id === 3 ? ['Balcón'] : [])], isActive: true,
    };
  });
  const names = [
    ['Lucía', 'Pérez'], ['Martín', 'Gómez'], ['Valentina', 'Torres'], ['Santiago', 'López'],
    ['Camila', 'Fernández'], ['Mateo', 'Romero'], ['Sofía', 'Díaz'], ['Nicolás', 'Vega'],
    ['Julieta', 'Castro'], ['Tomás', 'Molina'], ['Florencia', 'Ríos'], ['Joaquín', 'Suárez'],
  ];
  const guests: Guest[] = names.map(([firstName, lastName], index) => ({
    id: index + 1, firstName, lastName, phone: `000${String(index + 1).padStart(7, '0')}`,
    email: `huesped${index + 1}@hotel-demo.example`,
  }));
  const services: Service[] = [
    { id: 1, name: 'Desayuno buffet', price: 8500, chargeType: 'PER_PERSON', isExtraBed: false, isActive: true },
    { id: 2, name: 'Cochera', price: 6000, chargeType: 'PER_DAY', isExtraBed: false, isActive: true },
    { id: 3, name: 'Circuito de spa', price: 25000, chargeType: 'PACK', isExtraBed: false, isActive: true },
    { id: 4, name: 'Cama extra', price: 15000, chargeType: 'PER_DAY', isExtraBed: true, isActive: true },
  ];
  const reservations: (Reservation & { createdAt: string })[] = [];
  for (const room of rooms) {
    for (let offset = -32; offset <= 24; offset += 7) {
      const start = offset + room.id % 4;
      const nights = 2 + room.id % 3;
      const id = reservations.length + 1;
      const checkIn = shiftDay(today, start);
      const checkOut = shiftDay(checkIn, nights);
      const status = id % 11 === 0 ? 'CANCELLED' : checkOut <= today ? 'CHECKED_OUT' : checkIn <= today ? 'CHECKED_IN' : id % 5 === 0 ? 'PENDING' : 'RESERVED';
      const guest = guests[(id - 1) % guests.length];
      const total = room.price * nights;
      const reservation: Reservation & { createdAt: string } = {
        id, code: `RSV-DEMO${String(id).padStart(4, '0')}`, roomId: room.id, guestId: guest.id,
        totalAmount: total, depositRequired: computeBookingDeposit(total, 20),
        checkIn, checkOut, persons: room.capacity, extraBeds: 0, status, source: 'STAFF',
        checkedInAt: status === 'CHECKED_IN' || status === 'CHECKED_OUT' ? `${checkIn}T14:00:00Z` : null,
        checkedOutAt: status === 'CHECKED_OUT' ? `${checkOut}T13:00:00Z` : null,
        createdAt: `${shiftDay(checkIn, -2)}T15:00:00Z`,
        cancelledAt: status === 'CANCELLED' ? `${shiftDay(checkIn, -1)}T15:00:00Z` : null, refundEligible: false, refundAmount: null, refunded: false, refundedAt: null,
        notes: 'Reserva ficticia para demostración.', room, guest, services: [],
        payments: status === 'PENDING' || status === 'CANCELLED' ? [] : [{
          id, amount: status === 'CHECKED_OUT' ? total : round2(total * 0.3),
          method: id % 2 ? 'TRANSFER' : 'CASH', paidAt: `${shiftDay(checkIn, -2)}T15:00:00Z`, reference: `DEMO-${id}`,
        }],
        totals: { nights, roomPrice: room.price, roomTotal: total, servicesTotal: 0, total, amountPaid: 0, balance: total },
      };
      updateTotals(reservation);
      reservations.push(reservation);
    }
  }
  return { roomTypes, rooms, guests, services, reservations, today };
}

export type DemoData = ReturnType<typeof createDemoData>;
