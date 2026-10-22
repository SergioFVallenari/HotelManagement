import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isEmail } from '../src/lib/validate.js';

describe('isEmail', () => {
  it('acepta emails válidos', () => {
    assert.equal(isEmail('ana@dominio.com'), true);
    assert.equal(isEmail('a.b+tag@sub.dominio.com.ar'), true);
  });

  it('rechaza emails mal formados', () => {
    assert.equal(isEmail('no-es-un-email'), false);
    assert.equal(isEmail('ana@dominio'), false);
    assert.equal(isEmail('ana @dominio.com'), false);
    assert.equal(isEmail('ana@dominio.com '), false);
    assert.equal(isEmail(''), false);
  });
});
