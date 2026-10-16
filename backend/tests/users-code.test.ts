import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateCode, hashCode, isCodeMatch, isEmail } from '../src/modules/users/users.code.js';

describe('generateCode', () => {
  it('genera un código de 6 dígitos', () => {
    const code = generateCode();
    assert.match(code, /^\d{6}$/);
  });

  it('no siempre devuelve el mismo código', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateCode()));
    assert.ok(codes.size > 1);
  });
});

describe('hashCode / isCodeMatch', () => {
  it('es determinístico para el mismo código y secreto', () => {
    assert.equal(hashCode('123456', 'secreto'), hashCode('123456', 'secreto'));
  });

  it('acepta el código correcto', () => {
    const hash = hashCode('123456', 'secreto');
    assert.equal(isCodeMatch('123456', hash, 'secreto'), true);
  });

  it('rechaza otro código', () => {
    const hash = hashCode('123456', 'secreto');
    assert.equal(isCodeMatch('123457', hash, 'secreto'), false);
  });

  it('rechaza otro secreto', () => {
    const hash = hashCode('123456', 'secreto');
    assert.equal(isCodeMatch('123456', hash, 'otro'), false);
  });

  it('rechaza un hash corrupto sin lanzar', () => {
    assert.equal(isCodeMatch('123456', 'x', 'secreto'), false);
    assert.equal(isCodeMatch('123456', '', 'secreto'), false);
  });
});

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
