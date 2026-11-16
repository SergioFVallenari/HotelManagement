import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateCoverageSchema } from '../src/modules/billing/billing.schema.js';

test('la selección admite hasta tres hoteles distintos', () => {
  assert.equal(updateCoverageSchema.safeParse({ companyIds: [1, 2, 3] }).success, true);
  for (const companyIds of [[1, 2, 3, 4], [1, 1], [0], [-1]]) {
    assert.equal(updateCoverageSchema.safeParse({ companyIds }).success, false);
  }
  assert.equal(updateCoverageSchema.safeParse({ companyIds: [1], ownerId: 2 }).success, false);
});
