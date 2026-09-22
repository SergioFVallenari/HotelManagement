export function money(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }).format(n);
}

export function dateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

export function dateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const RESERVATION_STATUS: Record<string, { label: string; cls: string }> = {
  RESERVED: { label: 'Reservada', cls: 'text-bg-primary' },
  CHECKED_IN: { label: 'Check-in', cls: 'text-bg-success' },
  CHECKED_OUT: { label: 'Check-out', cls: 'text-bg-secondary' },
  CANCELLED: { label: 'Cancelada', cls: 'text-bg-danger' },
};

export const PAYMENT_METHODS: Record<string, string> = {
  CASH: 'Efectivo',
  CARD: 'Tarjeta',
  TRANSFER: 'Transferencia',
};

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