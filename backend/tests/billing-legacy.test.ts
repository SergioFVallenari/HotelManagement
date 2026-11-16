import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earliestLegacyTrial } from '../src/modules/billing/billing.legacy.js';

test('consolida trials anteriores sin reiniciar ni extender la prueba', () => {
  const first = { companyId: 3, startedAt: new Date('2026-10-29T00:00:00Z'), endsAt: new Date('2026-11-12T00:00:00Z') };
  const second = { companyId: 2, startedAt: new Date('2026-11-13T00:00:00Z'), endsAt: new Date('2026-11-27T00:00:00Z') };
  assert.equal(earliestLegacyTrial([second, first]), first);
  assert.equal(earliestLegacyTrial([]), null);
});

test('rechaza un trial con duración distinta de 14 días', () => {
  assert.throws(() => earliestLegacyTrial([{ companyId: 1, startedAt: new Date('2026-11-01T00:00:00Z'), endsAt: new Date('2026-11-02T00:00:00Z') }]));
});
