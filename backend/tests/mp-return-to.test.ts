import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  APP_RETURN_TO,
  buildReturnUrl,
  isAllowedReturnTo,
  normalizeOrigin,
  resolveReturnTo,
} from '../src/modules/mercadopago/mp.return-to.js';

const ORIGINS = [
  'https://6rpyewmzupirfb545vbhak666a0vhuwm.lambda-url.us-east-2.on.aws',
  'https://d5foovh2z74go.cloudfront.net',
  'https://localhost',
  'capacitor://localhost',
];

describe('normalizeOrigin', () => {
  it('deja solo el origen de una URL http(s)', () => {
    assert.equal(normalizeOrigin('https://app.example.com'), 'https://app.example.com');
    assert.equal(normalizeOrigin('http://localhost:5173/'), 'http://localhost:5173');
  });

  it('rechaza esquemas que no son http(s)', () => {
    assert.equal(normalizeOrigin(APP_RETURN_TO), null);
    assert.equal(normalizeOrigin('capacitor://localhost'), null);
    assert.equal(normalizeOrigin('javascript:alert(1)'), null);
    assert.equal(normalizeOrigin('no-es-una-url'), null);
  });

  it('rechaza una URL con path, query, hash o credenciales', () => {
    assert.equal(normalizeOrigin('https://app.example.com/ajustes'), null);
    assert.equal(normalizeOrigin('https://app.example.com?mp=connected'), null);
    assert.equal(normalizeOrigin('https://app.example.com#x'), null);
    assert.equal(normalizeOrigin('https://user:pass@app.example.com'), null);
  });
});

describe('isAllowedReturnTo', () => {
  it('acepta el esquema de la app nativa', () => {
    assert.equal(isAllowedReturnTo(APP_RETURN_TO, ORIGINS), true);
    assert.equal(APP_RETURN_TO, 'gestionhotel://oauth');
  });

  it('acepta los origenes de la allowlist', () => {
    assert.equal(isAllowedReturnTo('https://d5foovh2z74go.cloudfront.net', ORIGINS), true);
    assert.equal(isAllowedReturnTo('https://localhost', ORIGINS), true);
  });

  it('acepta cualquier origen de localhost, aunque no este en la allowlist', () => {
    assert.equal(isAllowedReturnTo('http://localhost:5174', ORIGINS), true);
    assert.equal(isAllowedReturnTo('http://127.0.0.1:5173', ORIGINS), true);
  });

  it('rechaza un origen que no esta en la allowlist', () => {
    assert.equal(isAllowedReturnTo('https://sitio-falso.example.com', ORIGINS), false);
    assert.equal(isAllowedReturnTo('https://d5foovh2z74go.cloudfront.net.evil.com', ORIGINS), false);
  });

  it('rechaza esquemas ajenos, incluso con un host permitido', () => {
    assert.equal(isAllowedReturnTo('gestionhotel://otro', ORIGINS), false);
    assert.equal(isAllowedReturnTo('gestionhotel://oauth/settings', ORIGINS), false);
    assert.equal(isAllowedReturnTo('capacitor://localhost', ORIGINS), false);
    assert.equal(isAllowedReturnTo('file:///etc/passwd', ORIGINS), false);
  });

  it('rechaza una URL con path para que buildReturnUrl no encadene rutas', () => {
    assert.equal(isAllowedReturnTo('https://d5foovh2z74go.cloudfront.net/cualquiera', ORIGINS), false);
  });
});

describe('resolveReturnTo', () => {
  it('deja intacto un valor permitido', () => {
    assert.equal(resolveReturnTo(APP_RETURN_TO, ORIGINS), APP_RETURN_TO);
    assert.equal(
      resolveReturnTo('https://d5foovh2z74go.cloudfront.net', ORIGINS),
      'https://d5foovh2z74go.cloudfront.net',
    );
  });

  it('cae al primer origen valido de la allowlist si el returnTo no es valido', () => {
    assert.equal(resolveReturnTo('https://sitio-falso.example.com', ORIGINS), ORIGINS[0]);
    assert.equal(resolveReturnTo('', ORIGINS), ORIGINS[0]);
  });

  it('omite las entradas de la allowlist que no son origenes http(s)', () => {
    assert.equal(resolveReturnTo('', ['capacitor://localhost', 'https://app.example.com']), 'https://app.example.com');
  });

  it('cae al esquema de la app si la allowlist no tiene ningun origen utilizable', () => {
    assert.equal(resolveReturnTo('', ['capacitor://localhost']), APP_RETURN_TO);
  });
});

describe('buildReturnUrl', () => {
  it('lleva el resultado a Ajustes con el query de MercadoPago', () => {
    assert.equal(
      buildReturnUrl('https://d5foovh2z74go.cloudfront.net', 'mp=connected'),
      'https://d5foovh2z74go.cloudfront.net/settings?mp=connected',
    );
  });

  it('arma el deep link que dispara el intent-filter de Android', () => {
    assert.equal(
      buildReturnUrl(APP_RETURN_TO, 'mp=error&reason=denied'),
      'gestionhotel://oauth/settings?mp=error&reason=denied',
    );
  });

  it('tolera barras finales y no duplica la Query', () => {
    assert.equal(buildReturnUrl('https://app.example.com/', 'mp=connected'), 'https://app.example.com/settings?mp=connected');
    assert.equal(buildReturnUrl('https://app.example.com///', 'mp=connected'), 'https://app.example.com/settings?mp=connected');
  });
});
