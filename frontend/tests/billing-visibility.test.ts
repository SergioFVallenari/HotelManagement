import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billingExperienceEnabled } from '../src/lib/billingVisibility.ts';

test('la experiencia de suscripción requiere habilitación explícita', () => {
  for (const value of [undefined, null, '', 'false', false, true, 'TRUE', '1']) assert.equal(billingExperienceEnabled(value), false);
  assert.equal(billingExperienceEnabled('true'), true);
});
