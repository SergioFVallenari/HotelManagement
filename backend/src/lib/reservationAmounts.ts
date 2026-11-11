import { decToNum, round2 } from './money.js';
import { computeBookingDeposit, quoteStay, type QuoteService } from './pricing.js';
import { roomSelectionsTotal, type RoomSnapshot } from './reservationRooms.js';
import { calculateDiscount, type Discount } from './discount.js';

export function calculateReservationAmounts(rooms: Pick<RoomSnapshot, 'roomPrice' | 'roomPricingMode' | 'persons'>[], nights: number, services: QuoteService[], depositPercent: number, depositOverride?: number, discount?: Discount | null) {
  const { total: totalAmount } = calculateDiscount(round2(roomSelectionsTotal(rooms, nights) + quoteStay(nights, 0, services).servicesTotal), discount);
  return { totalAmount, depositRequired: depositOverride !== undefined ? round2(depositOverride) : computeBookingDeposit(totalAmount, depositPercent) };
}

export function readReservationAmounts(row: { totalAmount: unknown; depositRequired: unknown }, payments: { amount: unknown }[] = []) {
  if (row.totalAmount == null || row.depositRequired == null) {
    throw new Error('La reserva no tiene importes guardados. Aplicá la migración de montos de reservas.');
  }
  const totalAmount = decToNum(row.totalAmount);
  const depositRequired = decToNum(row.depositRequired);
  const amountPaid = round2(payments.reduce((sum, payment) => sum + decToNum(payment.amount), 0));
  return { totalAmount, depositRequired, amountPaid, balance: round2(totalAmount - amountPaid) };
}
