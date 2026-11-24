import { prisma } from '../../config/prisma.js';
import { processTestBillingPayment } from './billing.paymentProcessor.js';
import { processTestBillingSubscription } from './billing.subscriptionProcessor.js';

export async function processTestBillingEvent(eventId: number, transport: typeof fetch = fetch): Promise<'RECORDED' | 'DEFERRED'> {
  const event = await prisma.ownerBillingWebhookEvent.findUnique({ where: { id: eventId }, select: { topic: true, provider: true, status: true } });
  if (!event || event.provider !== 'MERCADOPAGO' || event.status === 'PROCESSED') return 'DEFERRED';
  if (event.topic === 'subscription_authorized_payment') return processTestBillingPayment(eventId, transport);
  if (event.topic === 'subscription_preapproval') return processTestBillingSubscription(eventId, transport);
  return 'DEFERRED';
}
