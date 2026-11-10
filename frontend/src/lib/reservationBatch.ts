import type { PaymentMethod, Service } from '../api/types.ts';
import type { SelectedRoom } from './reservationRooms.ts';
import { selectedRoomsTotal } from './reservationRooms.ts';
import { nightsCount, round2 } from './format.ts';
import { serviceQuantity } from './pricing.ts';

export interface IndependentReservationDetails {
  firstName: string;
  lastName: string;
  paymentMode: 'none' | 'full' | 'custom';
  amount: string;
  method: Exclude<PaymentMethod, 'MERCADOPAGO'>;
  notes: string;
}

export function emptyIndependentDetails(): IndependentReservationDetails {
  return { firstName: '', lastName: '', paymentMode: 'none', amount: '', method: 'CASH', notes: '' };
}

export function independentRoomQuote(line: SelectedRoom, nights: number, extraBedService?: Service) {
  const quantity = line.extraBeds > 0 && extraBedService
    ? serviceQuantity(extraBedService.chargeType, { persons: line.persons, extraBeds: line.extraBeds, nights, roomCount: 1 }, extraBedService.chargeType === 'PER_PERSON' ? line.persons : undefined, true, extraBedService.intervalDays)
    : 0;
  return {
    total: round2(selectedRoomsTotal([line], nights) + quantity * (extraBedService?.price ?? 0)),
    services: quantity > 0 ? [{ serviceId: extraBedService!.id, quantity }] : [],
  };
}

export function buildIndependentReservations(rooms: SelectedRoom[], checkIn: string, checkOut: string, details: Record<number, IndependentReservationDetails>, extraBedService?: Service) {
  const nights = nightsCount(checkIn, checkOut);
  if (!checkIn || !checkOut || !Number.isFinite(nights) || nights <= 0) throw new Error('Indicá un rango de fechas válido');
  if (!rooms.length || rooms.length > 50) throw new Error('Seleccioná entre 1 y 50 habitaciones');
  return rooms.map((line) => {
    const item = details[line.room.id] ?? emptyIndependentDetails();
    const firstName = item.firstName.trim();
    const lastName = item.lastName.trim();
    if (!!firstName !== !!lastName) throw new Error(`Completá nombre y apellido o dejá ambos vacíos en la habitación ${line.room.number}`);
    const quote = independentRoomQuote(line, nights, extraBedService);
    const amount = item.paymentMode === 'full' ? quote.total : item.paymentMode === 'custom' ? Number(item.amount) : 0;
    if (!Number.isFinite(amount) || amount < 0 || amount > quote.total || (item.paymentMode === 'custom' && amount <= 0)) throw new Error(`Indicá un cobro válido para la habitación ${line.room.number}`);
    return {
      rooms: [{ roomId: line.room.id, persons: line.persons, extraBeds: line.extraBeds }],
      checkIn,
      checkOut,
      ...(firstName ? { guest: { firstName, lastName } } : { genericGuest: true }),
      services: quote.services,
      notes: item.notes.trim() || null,
      ...(amount > 0 ? { payment: { amount: round2(amount), method: item.method } } : {}),
    };
  });
}
