import { round2 } from './money.js';
import type { ServiceChargeType } from '../generated/prisma/client.js';

// Paso 2 - Matematica de la estadia.
//
// Todo el calculo de precios vive aca (y no reimplementado en cada modulo)
// para que la cotizacion que ve el huesped en el formulario de WhatsApp sea
// exactamente la misma que la que calcula la reserva.

export interface StayContext {
  persons: number;
  extraBeds: number;
  nights: number;
}

export interface QuoteService {
  quantity: number;
  unitPrice: number;
}

export interface StayQuote {
  roomTotal: number;
  servicesTotal: number;
  total: number;
}

export type RoomPricingMode = 'PER_NIGHT' | 'PER_PERSON';

export function roomStayTotal(mode: RoomPricingMode, price: number, nights: number, persons: number): number {
  return round2(price * nights * (mode === 'PER_PERSON' ? persons : 1));
}

// Cantidad de unidades de un servicio segun su tipo de cargo.
export function serviceQuantity(
  chargeType: ServiceChargeType,
  ctx: StayContext,
  requested?: number,
  isExtraBed = false,
): number {
  switch (chargeType) {
    case 'PER_PERSON':
      return (requested ?? (ctx.persons + ctx.extraBeds)) * ctx.nights;
    case 'PER_DAY':
      if (isExtraBed) return ctx.extraBeds > 0 ? ctx.extraBeds * ctx.nights : ctx.nights;
      return ctx.nights;
    case 'PACK':
      return requested ?? 1;
  }
}

// Total de la estadia: noches por precio de la habitacion mas los servicios.
export function quoteStay(nights: number, roomPrice: number, services: QuoteService[]): StayQuote {
  const roomTotal = round2(nights * roomPrice);
  const servicesTotal = round2(services.reduce((acc, s) => acc + s.quantity * s.unitPrice, 0));
  return { roomTotal, servicesTotal, total: round2(roomTotal + servicesTotal) };
}

// El anticipo se redondea a multiplos de $10.000 para que el huesped pueda
// transferir un numero redondo (y no $23.500).
export const DEPOSIT_ROUND_STEP = 10_000;

export function roundToStep(value: number, step: number = DEPOSIT_ROUND_STEP): number {
  if (step <= 0) return round2(value);
  if (!Number.isFinite(value)) return 0;
  return round2(Math.round(value / step) * step);
}

// Anticipo = porcentaje del total, redondeado a multiplos de $10.000.
export function computeBookingDeposit(total: number, percent: number): number {
  const raw = round2((round2(total) * percent) / 100);
  if (raw <= 0) return 0;
  const rounded = roundToStep(raw);
  // Con totales chicos el redondeo dejaria el anticipo en 0: se conserva el
  // monto exacto en vez de no cobrar nada.
  if (rounded <= 0) return raw;
  return round2(Math.min(rounded, round2(total)));
}
