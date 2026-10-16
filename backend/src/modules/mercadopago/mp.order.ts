import { decToNum, round2 } from '../../lib/money.js';

export const MP_CURRENCY = 'ARS';

const MP_UTC_OFFSET = '-03:00';

export interface OrderGuestData {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface OrderPayloadInput {
  companyId: number;
  code: string;
  amount: number;
  guest?: OrderGuestData | null;
  checkIn?: string | null;
  appUrl: string;
  notificationUrl: string;
}

export interface PaymentSnapshot {
  total: number;
  payments: { method: string; amount: number }[];
}

export function buildExternalReference(companyId: number, code: string): string {
  return `${companyId}-${code}`;
}

export function toEventDate(checkIn?: string | null): string | undefined {
  if (!checkIn || !/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return undefined;
  return `${checkIn}T00:00:00${MP_UTC_OFFSET}`;
}

function buildOnlineConfig(code: string, appUrl: string, notificationUrl: string): Record<string, unknown> {
  const buyerUrl = `${appUrl.replace(/\/+$/, '')}/pago?reservation=${encodeURIComponent(code)}`;
  return {
    success_url: buyerUrl,
    failure_url: buyerUrl,
    pending_url: buyerUrl,
    auto_return: 'approved',
    callback_url: notificationUrl,
  };
}

export function outstandingBalance(snapshot: PaymentSnapshot): number {
  const amountPaid = snapshot.payments.reduce((acc, p) => acc + decToNum(p.amount), 0);
  return Math.max(0, round2(snapshot.total - round2(amountPaid)));
}

export function buildOrderPayload(opts: OrderPayloadInput): Record<string, unknown> {
  const eventDate = toEventDate(opts.checkIn);

  return {
    type: 'online',
    processing_mode: 'manual',
    currency: MP_CURRENCY,
    total_amount: round2(opts.amount).toFixed(2),
    external_reference: buildExternalReference(opts.companyId, opts.code),
    items: [
      {
        external_code: `RSV-${opts.code}`,
        title: `Reserva ${opts.code}`,
        quantity: 1,
        unit_price: round2(opts.amount).toFixed(2),
        category_id: 'accommodations',
        ...(eventDate ? { event_date: eventDate } : {}),
      },
    ],
    ...(opts.guest?.email ? { payer: { email: opts.guest.email } } : {}),
    config: {
      online: buildOnlineConfig(opts.code, opts.appUrl, opts.notificationUrl),
    },
  };
}
