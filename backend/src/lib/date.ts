import { badRequest } from './AppError.js';

const DAY_MS = 86_400_000;

export const HOTEL_TZ = 'America/Argentina/Buenos_Aires';

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

export function todayHotel(): Date {
  const timeZone = process.env.HOTEL_TZ ?? HOTEL_TZ;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return new Date(`${get('year')}-${get('month')}-${get('day')}T00:00:00.000Z`);
}