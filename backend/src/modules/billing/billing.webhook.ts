import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { verifyBillingNotification } from './providers/mercadoPagoWebhook.js';
import { processTestBillingPayment } from './billing.paymentProcessor.js';

export async function receiveTestBillingWebhook(req: Request, res: Response): Promise<void> {
  const config = env.billingMpTest;
  if (!config.webhookEnabled || !config.webhookSecret) throw new AppError(503, 'BILLING_WEBHOOK_DISABLED', 'El webhook de facturación de prueba está desactivado.');
  const event = verifyBillingNotification({
    body: req.body, queryResourceId: req.query['data.id'], signature: req.get('x-signature'), requestId: req.get('x-request-id'),
    secret: config.webhookSecret, now: Date.now(),
  });
  const stored = await prisma.ownerBillingWebhookEvent.upsert({
    where: { provider_providerNotificationId: { provider: 'MERCADOPAGO', providerNotificationId: event.fingerprint } },
    create: { provider: 'MERCADOPAGO', providerNotificationId: event.fingerprint, topic: event.topic, resourceId: event.resourceId },
    update: {},
  });
  if (config.enabled && config.accessToken && event.topic === 'subscription_authorized_payment') {
    await processTestBillingPayment(stored.id);
  }
  res.status(200).json({ data: { received: true } });
}
