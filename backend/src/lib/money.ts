export function decToNum(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'object' && 'toNumber' in (value as object)) {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function clampAmount(n: number, max: number): number {
  if (!Number.isFinite(n)) return 0;
  const rounded = round2(n);
  if (rounded <= 0) return 0;
  const cap = round2(max);
  if (cap <= 0) return 0;
  return rounded > cap ? cap : rounded;
}

export type AmountFormat = 'decimal' | 'cents' | 'unknown';

export function resolveAmount(
  raw: number,
  expected: number,
): { amount: number; format: AmountFormat } {
  if (round2(raw) === round2(expected)) return { amount: round2(expected), format: 'decimal' };
  if (round2(raw / 100) === round2(expected)) return { amount: round2(expected), format: 'cents' };
  return { amount: round2(raw), format: 'unknown' };
}