import { round2 } from './format.ts';

// Espejo de backend/src/lib/pricing.ts: el frontend solo muestra una
// estimacion mientras la recepcion arma la solicitud. El total y el anticipo
// definitivos los calcula el backend y quedan congelados en el link.
export const DEPOSIT_ROUND_STEP = 10000;

export function roundToStep(value: number, step: number = DEPOSIT_ROUND_STEP): number {
  if (step <= 0) return round2(value);
  if (!Number.isFinite(value)) return 0;
  return round2(Math.round(value / step) * step);
}

export function computeBookingDeposit(total: number, percent: number): number {
  const raw = round2((round2(total) * percent) / 100);
  if (raw <= 0) return 0;
  const rounded = roundToStep(raw);
  if (rounded <= 0) return raw;
  return round2(Math.min(rounded, round2(total)));
}

interface QuantityContext {
  persons: number;
  extraBeds: number;
  nights: number;
}

export function serviceQuantity(
  chargeType: string,
  ctx: QuantityContext,
  requested?: number | null,
  isExtraBed = false,
): number {
  switch (chargeType) {
    case 'PER_PERSON':
      return (requested ?? ctx.persons + ctx.extraBeds) * ctx.nights;
    case 'PER_DAY':
      if (isExtraBed) return ctx.extraBeds > 0 ? ctx.extraBeds * ctx.nights : ctx.nights;
      return ctx.nights;
    default:
      return requested ?? 1;
  }
}
