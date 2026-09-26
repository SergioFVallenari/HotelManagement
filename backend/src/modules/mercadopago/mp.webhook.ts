import { WebhookSignatureValidator } from 'mercadopago';
import type { Request } from 'express';
import { prisma } from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { withTenant } from '../../lib/tenant.js';
import { AppError } from '../../lib/AppError.js';
import { decToNum, resolveAmount, round2 } from '../../lib/money.js';
import { getReservation } from '../reservations/reservations.service.js';
import { MP_CURRENCY, buildExternalReference } from './mp.order.js';

interface MpOrderPayment {
  id?: string | number;
  status?: string;
  status_detail?: string;
  amount?: string | number;
  paid_amount?: string | number;
}

interface MpWebhookPayload {
  type?: string;
  action?: string;
  data?: {
    id?: string | number;
    external_reference?: string;
    status?: string;
    status_detail?: string;
    currency_id?: string;
    total_amount?: string | number;
    total_paid_amount?: string | number;
    transactions?: { payments?: MpOrderPayment[] };
  };
}

const PAID_PAYMENT_STATUSES = new Set(['processed', 'accredited', 'approved']);

function queryValue(req: Request, key: string): string | undefined {
  const raw = (req.query as Record<string, string | string[] | undefined>)[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === undefined || value === '' ? undefined : value;
}

function isPaid(data: NonNullable<MpWebhookPayload['data']>): boolean {
  if (data.status !== 'processed') return false;
  const payments = data.transactions?.payments ?? [];
  if (payments.length === 0) return false;
  return payments.every((payment) => PAID_PAYMENT_STATUSES.has(payment.status ?? ''));
}

function assertSignature(req: Request, dataId: string): void {
  const secret = env.mp.webhookSecret;
  if (!secret) {
    if (env.isProduction) {
      throw new AppError(500, 'MP_WEBHOOK_SECRET_MISSING', 'Falta MP_WEBHOOK_SECRET en el servidor');
    }
    return;
  }
  try {
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId: dataId.toLowerCase(),
      secret,
      toleranceSeconds: 300,
    });
  } catch (err) {
    console.warn('[mp] webhook con firma inválida:', err instanceof Error ? err.message : err);
    throw new AppError(401, 'MP_WEBHOOK_INVALID_SIGNATURE', 'Firma de MercadoPago inválida');
  }
}

export async function processWebhook(req: Request): Promise<boolean> {
  const body = (req.body ?? {}) as MpWebhookPayload;
  const type = body.type ?? queryValue(req, 'type');
  if (type !== 'order') return false;

  const orderId = body.data?.id ?? queryValue(req, 'data.id');
  if (orderId === undefined) return false;
  const data = body.data ?? {};

  assertSignature(req, String(orderId));

  const reservation = await prisma.reservation.findFirst({
    where: { mpOrderId: String(orderId) },
    select: { id: true, code: true, companyId: true, status: true },
  });
  if (!reservation) {
    console.warn('[mp] webhook sin reserva para la orden', { orderId: String(orderId) });
    return false;
  }

  const expectedReference = buildExternalReference(reservation.companyId, reservation.code);
  if (data.external_reference && data.external_reference !== expectedReference) {
    console.warn('[mp] external_reference no coincide con la reserva', {
      orderId: String(orderId),
      received: data.external_reference,
      expected: expectedReference,
    });
    return false;
  }

  if (!isPaid(data)) return false;

  if (data.currency_id && data.currency_id !== MP_CURRENCY) {
    console.warn('[mp] moneda inesperada en el webhook', {
      orderId: String(orderId),
      received: data.currency_id,
      expected: MP_CURRENCY,
    });
  }

  const expectedTotal = (await withTenant(reservation.companyId, () => getReservation(reservation.id))).totals
    .total;

  const payments = data.transactions?.payments ?? [];
  for (const payment of payments) {
    if (!payment.id) continue;
    const paymentId = String(payment.id);
    const received = decToNum(payment.paid_amount ?? payment.amount);
    const { amount, format } = resolveAmount(received, expectedTotal);
    if (format === 'unknown') {
      console.warn('[mp] el importe del webhook no coincide con el total de la reserva', {
        orderId: String(orderId),
        paymentId,
        received,
        expected: expectedTotal,
      });
    } else if (format === 'cents') {
      console.warn('[mp] el webhook envió centavos; se normalizó al total de la reserva', {
        orderId: String(orderId),
        paymentId,
        received,
        amount,
      });
    }
    await recordApprovedPayment(reservation.companyId, {
      paymentId,
      reservationId: reservation.id,
      amount,
    });
  }
  return true;
}

async function recordApprovedPayment(
  companyId: number,
  payload: { paymentId: string; reservationId: number; amount: number },
): Promise<boolean> {
  return withTenant(companyId, () =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.payment.findUnique({ where: { reference: payload.paymentId } });
      if (existing) return true;

      await tx.payment.create({
        data: {
          reservationId: payload.reservationId,
          amount: round2(payload.amount),
          method: 'MERCADOPAGO',
          reference: payload.paymentId,
        },
      });

      const reservation = await tx.reservation.findUnique({
        where: { id: payload.reservationId },
        select: { status: true },
      });
      if (reservation?.status === 'PENDING') {
        await tx.reservation.update({
          where: { id: payload.reservationId },
          data: { status: 'RESERVED' },
        });
      }
      return true;
    }),
  );
}
