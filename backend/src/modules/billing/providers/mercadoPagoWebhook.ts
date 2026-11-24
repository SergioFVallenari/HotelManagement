import { createHash } from 'node:crypto';
import { WebhookSignatureValidator } from 'mercadopago';
import { AppError } from '../../../lib/AppError.js';
import { buildManifestDataId, readSignatureTs, SIGNATURE_TOLERANCE_MS, toEpochMs } from '../../mercadopago/mp.signature.js';
import { parseMercadoPagoBillingNotification } from './mercadoPagoEvents.js';

export function verifyBillingNotification(input: {
  body: unknown;
  queryResourceId: unknown;
  signature: string | undefined;
  requestId: string | undefined;
  secret: string;
  now: number;
  allowLiveAuthorizedPayment?: boolean;
}) {
  const event = parseMercadoPagoBillingNotification(input.body);
  if (!event || (event.liveMode === true && !(input.allowLiveAuthorizedPayment === true && event.topic === 'subscription_authorized_payment')) || typeof input.queryResourceId !== 'string' || input.queryResourceId !== event.resourceId || !input.requestId || !input.signature) {
    throw new AppError(400, 'BILLING_WEBHOOK_INVALID', 'La notificación de prueba no es válida.');
  }
  const ts = readSignatureTs(input.signature);
  const epoch = ts === undefined ? undefined : toEpochMs(ts);
  if (epoch === undefined || Math.abs(input.now - epoch) > SIGNATURE_TOLERANCE_MS) {
    throw new AppError(401, 'BILLING_WEBHOOK_SIGNATURE', 'Firma de facturación inválida o vencida.');
  }
  try {
    WebhookSignatureValidator.validate({ xSignature: input.signature, xRequestId: input.requestId, dataId: buildManifestDataId(event.resourceId), secret: input.secret });
  } catch {
    throw new AppError(401, 'BILLING_WEBHOOK_SIGNATURE', 'Firma de facturación inválida o vencida.');
  }
  const fingerprint = createHash('sha256').update(JSON.stringify([input.requestId, input.signature, event.topic, event.resourceId])).digest('hex');
  return { ...event, fingerprint };
}
