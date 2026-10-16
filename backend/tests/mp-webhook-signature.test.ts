import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SIGNATURE_TOLERANCE_MS,
  buildManifestDataId,
  readSignatureTs,
  toEpochMs,
} from '../src/modules/mercadopago/mp.signature.js';

const MP_SIGNATURE = 'ts=1742505638683,v1=ced36ab6d33566bb1e16c125819b8d840d6b8ef136b0b9127c76064466f5229b';

describe('buildManifestDataId', () => {
  it('pasa a minusculas el id alfanumerico que devuelve MercadoPago', () => {
    assert.equal(
      buildManifestDataId('ORDTST01M3M901MK2MAPZTVBP28H4PK5'),
      'ordtst01m3m901mk2mapztvbp28h4pk5',
    );
    assert.equal(
      buildManifestDataId('ORD01M28P44G5FG8RJPM579EH56FV'),
      'ord01m28p44g5fg8rjpm579eh56fv',
    );
  });

  it('deja intacto un id numerico de payments', () => {
    assert.equal(buildManifestDataId(123456), '123456');
    assert.equal(buildManifestDataId('123456'), '123456');
  });

  it('devuelve cadena vacia cuando no hay id, para omitirlo del manifest', () => {
    assert.equal(buildManifestDataId(undefined), '');
    assert.equal(buildManifestDataId(null), '');
    assert.equal(buildManifestDataId('   '), '');
  });

  it('recorta espacios antes de pasar al manifest', () => {
    assert.equal(buildManifestDataId('  ORD01ABC  '), 'ord01abc');
  });
});

describe('readSignatureTs', () => {
  it('extrae el ts del header x-signature', () => {
    assert.equal(readSignatureTs(MP_SIGNATURE), '1742505638683');
  });

  it('tolera espacios y mayusculas en el nombre del campo', () => {
    assert.equal(readSignatureTs('ts=1704908010 , v1=abc'), '1704908010');
    assert.equal(readSignatureTs('TS=1704908010,v1=abc'), '1704908010');
  });

  it('devuelve undefined si falta o no es numerico', () => {
    assert.equal(readSignatureTs(undefined), undefined);
    assert.equal(readSignatureTs('v1=abc'), undefined);
    assert.equal(readSignatureTs('ts=abc,v1=abc'), undefined);
  });

  it('normaliza el header cuando express lo entrega como arreglo', () => {
    assert.equal(readSignatureTs([MP_SIGNATURE]), '1742505638683');
  });
});

describe('toEpochMs', () => {
  it('interpreta el ts en milisegundos que manda MercadoPago', () => {
    assert.equal(toEpochMs('1742505638683'), 1742505638683);
  });

  it('convierte a milisegundos cuando el ts viene en segundos', () => {
    assert.equal(toEpochMs('1742505638'), 1742505638000);
  });

  it('da el mismo epoch para el mismo instante con y sin milisegundos', () => {
    const seconds = Math.floor(Date.now() / 1000);
    assert.equal(toEpochMs(String(seconds)), toEpochMs(String(seconds * 1000)));
  });

  it('devuelve undefined cuando el ts no es un numero entero', () => {
    assert.equal(toEpochMs('abc'), undefined);
    assert.equal(toEpochMs('17.4'), undefined);
    assert.equal(toEpochMs('-1742505638683'), undefined);
  });
});

describe('ventana de tolerancia', () => {
  it('permite una notificacion de ahora y rechaza una vieja', () => {
    const now = Date.now();
    const fresh = toEpochMs(String(now));
    const stale = toEpochMs(String(now - 10 * 60 * 1000));
    assert.ok(fresh !== undefined && stale !== undefined);
    assert.ok(Math.abs(now - fresh) <= SIGNATURE_TOLERANCE_MS);
    assert.ok(Math.abs(now - stale) > SIGNATURE_TOLERANCE_MS);
  });
});
