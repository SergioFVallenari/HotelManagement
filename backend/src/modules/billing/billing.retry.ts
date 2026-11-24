export const BILLING_MAX_ATTEMPTS = 8;
export const BILLING_LEASE_MS = 120_000;
export const BILLING_BATCH_SIZE = 20;

export function billingRetryAt(attempt: number, now: Date): Date | null {
  if (!Number.isInteger(attempt) || attempt < 1 || !Number.isFinite(now.getTime())) throw new Error('El intento de facturación no es válido.');
  if (attempt >= BILLING_MAX_ATTEMPTS) return null;
  return new Date(now.getTime() + Math.min(60_000 * 2 ** (attempt - 1), 3_600_000));
}

export function billingRetryWhere(now: Date) {
  return {
    provider: 'MERCADOPAGO',
    topic: 'subscription_authorized_payment',
    status: { in: ['RECEIVED', 'FAILED'] as Array<'RECEIVED' | 'FAILED'> },
    attempts: { lt: BILLING_MAX_ATTEMPTS },
    nextAttemptAt: { lte: now },
    OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
  };
}

export async function runBillingRetryBatch(ids: readonly number[], process: (id: number) => Promise<'RECORDED' | 'DEFERRED'>) {
  if (ids.length > BILLING_BATCH_SIZE || ids.some((id) => !Number.isSafeInteger(id) || id <= 0) || new Set(ids).size !== ids.length) {
    throw new Error('El lote de reintentos no es válido.');
  }
  const summary = { selected: ids.length, recorded: 0, deferred: 0, failed: 0 };
  for (const id of ids) {
    try {
      const result = await process(id);
      if (result === 'RECORDED') summary.recorded++;
      else summary.deferred++;
    } catch {
      summary.failed++;
    }
  }
  return summary;
}
