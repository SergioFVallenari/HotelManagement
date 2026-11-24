import type { Request, Response } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError } from '../../lib/AppError.js';
import { verifyBillingNotification } from './providers/mercadoPagoWebhook.js';
import { processTestBillingEvent } from './billing.eventProcessor.js';
import { billingTestAccountPolicy } from './billing.testAccountPolicy.js';

export async function receiveTestBillingWebhook(req: Request, res: Response): Promise<void> {
  const config = env.billingMpTest;
  if (!config.webhookEnabled || !config.webhookSecret) throw new AppError(503, 'BILLING_WEBHOOK_DISABLED', 'El webhook de facturación de prueba está desactivado.');
  const configuredAccounts = billingTestAccountPolicy();
  const event = verifyBillingNotification({
    body: req.body, queryResourceId: req.query['data.id'], signature: req.get('x-signature'), requestId: req.get('x-request-id'),
    secret: config.webhookSecret, now: Date.now(),
    allowLiveAuthorizedPayment: configuredAccounts !== null,
  });
  const stored = await prisma.ownerBillingWebhookEvent.upsert({
    where: { provider_providerNotificationId: { provider: 'MERCADOPAGO', providerNotificationId: event.fingerprint } },
    create: { provider: 'MERCADOPAGO', providerNotificationId: event.fingerprint, topic: event.topic, resourceId: event.resourceId },
    update: {},
  });
  if (config.enabled && config.accessToken) {
    await processTestBillingEvent(stored.id);
  }
  res.status(200).json({ data: { received: true } });
}
