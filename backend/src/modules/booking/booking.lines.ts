import { decToNum } from '../../lib/money.js';

// Snapshot de servicios que queda congelado en el link publico. Se guarda como
// JSON: no se recalcula con los precios actuales del hotel.
export interface BookingServiceLine {
  serviceId: number;
  name: string;
  description?: string | null;
  intervalDays?: number | null;
  isExtraBed?: boolean;
  chargeType: string;
  quantity: number;
  personsCovered: number | null;
  unitPrice: number;
  lineTotal: number;
}

export function parseServiceLines(value: unknown): BookingServiceLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const line = item as Record<string, unknown>;
    return [
      {
        serviceId: Number(line.serviceId ?? 0),
        name: typeof line.name === 'string' ? line.name : '',
        description: typeof line.description === 'string' ? line.description : null,
        intervalDays: typeof line.intervalDays === 'number' && Number.isInteger(line.intervalDays) && line.intervalDays > 0 ? line.intervalDays : null,
        ...(typeof line.isExtraBed === 'boolean' ? { isExtraBed: line.isExtraBed } : {}),
        chargeType: typeof line.chargeType === 'string' ? line.chargeType : 'PACK',
        quantity: Number(line.quantity ?? 0),
        personsCovered: line.personsCovered == null ? null : Number(line.personsCovered),
        unitPrice: decToNum(line.unitPrice),
        lineTotal: decToNum(line.lineTotal),
      },
    ];
  });
}
