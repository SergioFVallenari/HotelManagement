type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
}

function numericId(value: unknown): string | null {
  if (typeof value === 'string' && /^[1-9]\d{0,199}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  return null;
}

export type TestAccountEvidence =
  | { verified: true }
  | { verified: false; reason: 'IDENTITY_UNAVAILABLE' | 'SELLER_MISMATCH' | 'BUYER_MISMATCH' | 'TEST_TAG_UNAVAILABLE' };

export async function verifyBillingTestAccounts(paymentValue: unknown, readIdentity: (id: string) => Promise<unknown>): Promise<TestAccountEvidence> {
  const payment = record(paymentValue);
  const collectorId = numericId(payment?.collector_id);
  const payerId = numericId(record(payment?.payer)?.id);
  if (!collectorId || !payerId || collectorId === payerId) return { verified: false, reason: 'IDENTITY_UNAVAILABLE' };
  let seller: JsonObject | null;
  let buyer: JsonObject | null;
  try {
    seller = record(await readIdentity('me'));
    if (!seller || numericId(seller.id) !== collectorId) return { verified: false, reason: 'SELLER_MISMATCH' };
    if (!Array.isArray(seller.tags) || !seller.tags.includes('test_user')) return { verified: false, reason: 'TEST_TAG_UNAVAILABLE' };
    buyer = record(await readIdentity(payerId));
  } catch {
    return { verified: false, reason: 'IDENTITY_UNAVAILABLE' };
  }
  if (!buyer || numericId(buyer.id) !== payerId) return { verified: false, reason: 'BUYER_MISMATCH' };
  if (!Array.isArray(buyer.tags) || !buyer.tags.includes('test_user')) return { verified: false, reason: 'TEST_TAG_UNAVAILABLE' };
  return { verified: true };
}
