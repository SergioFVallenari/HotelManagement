export function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10).split('-').reverse().join('-');
}

export const CHECK_IN_TIME = '11:00';
export const CHECK_OUT_TIME = '10:00';
export const HOTEL_TZ = 'America/Argentina/Buenos_Aires';

export function hotelToday(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HOTEL_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function dateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const date = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  const time = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
}

export const RESERVATION_STATUS: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Pago pendiente', cls: 'text-bg-warning' },
  RESERVED: { label: 'Reservada', cls: 'text-bg-primary' },
  CHECKED_IN: { label: 'Check-in', cls: 'text-bg-success' },
  CHECKED_OUT: { label: 'Check-out', cls: 'text-bg-secondary' },
  CANCELLED: { label: 'Cancelada', cls: 'text-bg-danger' },
};

export const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
  MERCADOPAGO: 'MercadoPago',
};

export const CHARGE_TYPES: Record<string, string> = {
  PER_PERSON: 'Por persona',
  PER_DAY: 'Por día',
  PACK: 'Pack / fijo',
};

export function nightsCount(checkIn: string, checkOut: string): number {
  const a = new Date(`${checkIn}T00:00:00`);
  const b = new Date(`${checkOut}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function firstDayOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}