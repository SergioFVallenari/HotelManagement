import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeBookingDeposit,
  DEPOSIT_ROUND_STEP,
  quoteStay,
  roundToStep,
  serviceQuantity,
} from '../src/lib/pricing.js';

describe('serviceQuantity', () => {
  const ctx = { persons: 2, extraBeds: 0, nights: 3 };

  it('multiplica por las noches y las personas en PER_PERSON', () => {
    assert.equal(serviceQuantity('PER_PERSON', ctx), 6);
    assert.equal(serviceQuantity('PER_PERSON', ctx, 1), 3);
  });

  it('cuenta una unidad por noche en PER_DAY', () => {
    assert.equal(serviceQuantity('PER_DAY', ctx), 3);
  });

  it('cuenta las camas extra por noche en PER_DAY', () => {
    assert.equal(serviceQuantity('PER_DAY', { ...ctx, extraBeds: 2 }, undefined, true), 6);
    assert.equal(serviceQuantity('PER_DAY', ctx, undefined, true), 3);
  });

  it('respeta la cantidad fija en PACK', () => {
    assert.equal(serviceQuantity('PACK', ctx), 1);
    assert.equal(serviceQuantity('PACK', ctx, 4), 4);
  });
});

describe('quoteStay', () => {
  it('suma las noches por el precio de la habitacion y los servicios', () => {
    const quote = quoteStay(3, 50000, [{ quantity: 6, unitPrice: 8000 }]);
    assert.equal(quote.roomTotal, 150000);
    assert.equal(quote.servicesTotal, 48000);
    assert.equal(quote.total, 198000);
  });

  it('redondea a dos decimales', () => {
    const quote = quoteStay(2, 1000.005, [{ quantity: 1, unitPrice: 0.005 }]);
    assert.equal(quote.roomTotal, 2000.01);
    assert.equal(quote.total, 2000.02);
  });

  it('devuelve el total de la habitacion cuando no hay servicios', () => {
    const quote = quoteStay(2, 25000, []);
    assert.equal(quote.servicesTotal, 0);
    assert.equal(quote.total, 50000);
  });
});

describe('roundToStep', () => {
  it('redondea al multiplo de $10.000 mas cercano', () => {
    assert.equal(roundToStep(23500), 20000);
    assert.equal(roundToStep(27000), 30000);
    assert.equal(roundToStep(25000), 30000);
    assert.equal(roundToStep(24000), 20000);
  });

  it('deja intactos los multiplos exactos', () => {
    assert.equal(roundToStep(20000), 20000);
    assert.equal(roundToStep(0), 0);
  });

  it('permite cambiar el paso', () => {
    assert.equal(roundToStep(23500, 100), 23500);
    assert.equal(roundToStep(23550, 100), 23600);
  });

  it('usa $10.000 como paso por defecto', () => {
    assert.equal(DEPOSIT_ROUND_STEP, 10000);
  });
});

describe('computeBookingDeposit', () => {
  it('calcula el 20% del total redondeado a la decena de miles', () => {
    assert.equal(computeBookingDeposit(100000, 20), 20000);
    assert.equal(computeBookingDeposit(150000, 20), 30000);
    assert.equal(computeBookingDeposit(50000, 20), 10000);
  });

  it('redondea a la baja cuando corresponde', () => {
    assert.equal(computeBookingDeposit(117500, 20), 20000);
  });

  it('redondea hacia arriba cuando corresponde', () => {
    assert.equal(computeBookingDeposit(135000, 20), 30000);
  });

  it('conserva el monto exacto cuando el redondeo dejaria el anticipo en cero', () => {
    assert.equal(computeBookingDeposit(10000, 20), 2000);
    assert.equal(computeBookingDeposit(12500, 20), 2500);
  });

  it('nunca cobra mas que el total', () => {
    assert.equal(computeBookingDeposit(5000, 100), 5000);
    assert.equal(computeBookingDeposit(12000, 90), 10000);
  });

  it('no cobra anticipo cuando el hotel no lo pide', () => {
    assert.equal(computeBookingDeposit(100000, 0), 0);
    assert.equal(computeBookingDeposit(0, 20), 0);
  });

  it('redondea a dos decimales el total antes de calcular', () => {
    assert.equal(computeBookingDeposit(100.005, 20), 20);
  });
});
