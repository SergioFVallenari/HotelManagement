import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRoomCapacity } from '../src/modules/billing/billing.roomLimit.js';
import { AppError } from '../src/lib/AppError.js';

function transaction(status: string | null, active: number): Parameters<typeof assertRoomCapacity>[0] {
  return {
    ownerBillingCoverage: { findUnique: async () => status ? { account: { status } } : null },
    room: { count: async () => active },
  } as unknown as Parameters<typeof assertRoomCapacity>[0];
}

test('permite hasta cinco habitaciones activas y bloquea la siguiente', async () => {
  await assertRoomCapacity(transaction('TRIALING', 4), 1);
  await assert.rejects(assertRoomCapacity(transaction('TRIALING', 5), 1), (err: unknown) => err instanceof AppError && err.code === 'ROOM_LIMIT_REACHED');
});

test('no limita hoteles grandfathered y no inventa suscripción si falta', async () => {
  await assertRoomCapacity(transaction('GRANDFATHERED', 50), 1);
  await assert.rejects(assertRoomCapacity(transaction(null, 0), 1), (err: unknown) => err instanceof AppError && err.code === 'BILLING_INCOMPLETE');
});
