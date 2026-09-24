import type { Request, Response } from 'express';
import { prisma } from '../../config/prisma.js';
import { conflict, notFound } from '../../lib/AppError.js';
import { decToNum } from '../../lib/money.js';
import { parseIdParam } from '../../lib/pagination.js';
import type { RecordPaymentInput } from './payments.schema.js';
import { recordPaymentSchema } from './payments.schema.js';

export async function createPaymentHandler(req: Request, res: Response): Promise<void> {
  const reservationId = parseIdParam(req.params.id);
  const input = recordPaymentSchema.parse(req.body) as RecordPaymentInput;

  const reservation = await prisma.reservation.findUnique({ where: { id: reservationId } });
  if (!reservation) throw notFound('Reserva', reservationId);
  if (reservation.status === 'CANCELLED') {
    throw conflict('INVALID_STATE', 'No se pueden registrar pagos en una reserva cancelada');
  }

  const payment = await prisma.payment.create({
    data: {
      reservationId,
      amount: input.amount,
      method: input.method,
      reference: input.reference,
    },
  });

  res.status(201).json({
    data: { id: payment.id, reservationId: payment.reservationId, amount: decToNum(payment.amount), method: payment.method, paidAt: payment.paidAt, reference: payment.reference },
  });
}

export async function deletePaymentHandler(req: Request, res: Response): Promise<void> {
  const id = parseIdParam(req.params.id);
  const payment = await prisma.payment.findFirst({
    where: { id, reservation: { companyId: req.user!.companyId } },
  });
  if (!payment) throw notFound('Pago', id);
  await prisma.payment.delete({ where: { id } });
  res.status(204).send();
}