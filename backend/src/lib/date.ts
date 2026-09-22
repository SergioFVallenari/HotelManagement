import { badRequest } from './AppError.js';

const DAY_MS = 86_400_000;

export function parseDate(value: unknown, fieldName: string): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`Fecha inválida para "${fieldName}" (se espera YYYY-MM-DD)`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw badRequest(`Fecha inválida para "${fieldName}"`);
  }
  return date;
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const nights = Math.round(
    (Date.UTC(checkOut.getUTCFullYear(), checkOut.getUTCMonth(), checkOut.getUTCDate()) -
      Date.UTC(checkIn.getUTCFullYear(), checkIn.getUTCMonth(), checkIn.getUTCDate())) /
      DAY_MS,
  );
  return nights;
}

export function overlapNights(checkIn: Date, checkOut: Date, from: Date, to: Date): number {
  const start = checkIn > from ? checkIn : from;
  const end = checkOut < to ? checkOut : to;
  if (end <= start) return 0;
  return nightsBetween(start, end);
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}