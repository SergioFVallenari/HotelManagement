import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampAmount, resolveAmount } from '../src/lib/money.js';

describe('resolveAmount', () => {
  it('acepta el formato decimal que manda MercadoPago en las ordenes online', () => {
    assert.deepEqual(resolveAmount(200, 200), { amount: 200, format: 'decimal' });
    assert.deepEqual(resolveAmount(200.5, 200.5), { amount: 200.5, format: 'decimal' });
    assert.deepEqual(resolveAmount(1234.56, 1234.56), { amount: 1234.56, format: 'decimal' });
  });

  it('normaliza centavos al total de la reserva', () => {
    assert.deepEqual(resolveAmount(20000, 200), { amount: 200, format: 'cents' });
    assert.deepEqual(resolveAmount(50, 0.5), { amount: 0.5, format: 'cents' });
    assert.deepEqual(resolveAmount(1, 0.01), { amount: 0.01, format: 'cents' });
  });

  it('detecta el caso de 100x que emite el simulador de MercadoPago', () => {
    assert.deepEqual(resolveAmount(100000, 1000), { amount: 1000, format: 'cents' });
    assert.deepEqual(resolveAmount(50000, 500), { amount: 500, format: 'cents' });
  });

  it('no inventa una coincidencia cuando el importe difiere de verdad', () => {
    assert.deepEqual(resolveAmount(150, 200), { amount: 150, format: 'unknown' });
    assert.deepEqual(resolveAmount(1, 200), { amount: 1, format: 'unknown' });
    assert.deepEqual(resolveAmount(199.99, 200), { amount: 199.99, format: 'unknown' });
  });

  it('redondea a dos decimales antes de comparar', () => {
    assert.deepEqual(resolveAmount(200.004, 200), { amount: 200, format: 'decimal' });
    assert.deepEqual(resolveAmount(123.4567, 999), { amount: 123.46, format: 'unknown' });
  });

  it('maneja cero sin confundir centavos con decimales', () => {
    assert.deepEqual(resolveAmount(0, 0), { amount: 0, format: 'decimal' });
  });

  it('propaga importes negativos tal cual llegan', () => {
    assert.deepEqual(resolveAmount(-200, -200), { amount: -200, format: 'decimal' });
  });
});

describe('clampAmount', () => {
  it('deja pasar un importe menor al tope', () => {
    assert.equal(clampAmount(100, 1000), 100);
    assert.equal(clampAmount(999.99, 1000), 999.99);
  });

  it('acepta exactamente el tope', () => {
    assert.equal(clampAmount(1000, 1000), 1000);
  });

  it('recorta un importe que supera el tope', () => {
    assert.equal(clampAmount(1500, 1000), 1000);
    assert.equal(clampAmount(1000.01, 1000), 1000);
  });

  it('redondea a dos decimales antes de comparar', () => {
    assert.equal(clampAmount(333.333, 1000), 333.33);
    assert.equal(clampAmount(1000.004, 1000), 1000);
    assert.equal(clampAmount(1000.006, 999.99), 999.99);
  });

  it('devuelve cero ante importes negativos o no finitos', () => {
    assert.equal(clampAmount(-50, 1000), 0);
    assert.equal(clampAmount(Number.NaN, 1000), 0);
    assert.equal(clampAmount(Number.POSITIVE_INFINITY, 1000), 0);
  });

  it('devuelve cero cuando el tope no permite cobrar nada', () => {
    assert.equal(clampAmount(100, 0), 0);
    assert.equal(clampAmount(100, -10), 0);
  });
});
