import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertTestingDeployConfig, type TestingDeployConfig } from '../src/lib/testingDeploy.js';

const config: TestingDeployConfig = {
  directUrl: 'postgresql://postgres.sowbuvdeampxsbpgtgvo:password-simulado@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require',
  railwayToken: 'token-simulado',
  railwayProjectId: 'b08689c6-2f68-4a09-9b57-3460e7117464',
  railwayEnvironmentId: '7a8a4ed7-5bfe-4bb4-8398-c808b1a7bd91',
  railwayServiceId: 'f1b43b01-2a88-4661-9f61-bc564e8075bd',
};

test('acepta exclusivamente el session pooler de testing con SSL y el servicio identificado', () => {
  assert.doesNotThrow(() => assertTestingDeployConfig(config));
  assert.doesNotThrow(() => assertTestingDeployConfig({ ...config, directUrl: `${config.directUrl}&schema=public&connect_timeout=15` }));
  assert.doesNotThrow(() => assertTestingDeployConfig({ ...config, directUrl: config.directUrl.replace('sslmode=require', 'sslmode=verify-full') }));
});

test('rechaza producción, otro host, puerto transaccional y conexiones sin SSL o contraseña', () => {
  for (const directUrl of [
    '', 'inválida', config.directUrl.replace('postgresql:', 'https:'),
    config.directUrl.replace('sowbuvdeampxsbpgtgvo', 'zbdonqyykuaohvneuhzb'),
    config.directUrl.replace('aws-0-sa-east-1.pooler.supabase.com', 'otro.example.test'),
    config.directUrl.replace('.pooler.supabase.com', '.pooler.supabase.com.example.test'),
    config.directUrl.replace(':5432', ':6543'), config.directUrl.replace(':5432', ''),
    config.directUrl.replace('?sslmode=require', ''), config.directUrl.replace('sslmode=require', 'sslmode=disable'),
    config.directUrl.replace(':password-simulado', ''), config.directUrl.replace('/postgres?', '/otra?'),
    `${config.directUrl}#oculto`,
  ]) assert.throws(() => assertTestingDeployConfig({ ...config, directUrl }));
});

test('rechaza parámetros capaces de redirigir la conexión, duplicados y esquemas inesperados', () => {
  for (const parameter of ['host=example.test', 'user=otro', 'port=6543', 'dbname=otra', 'options=valor', 'pgbouncer=true', 'sslmode=disable', 'schema=otra']) {
    assert.throws(() => assertTestingDeployConfig({ ...config, directUrl: `${config.directUrl}&${parameter}` }));
  }
});

test('no acepta secretos vacíos ni destinos Railway diferentes o incompletos', () => {
  for (const key of ['railwayToken', 'railwayProjectId', 'railwayEnvironmentId', 'railwayServiceId'] as const) {
    assert.throws(() => assertTestingDeployConfig({ ...config, [key]: '' }));
    assert.throws(() => assertTestingDeployConfig({ ...config, [key]: ' ' }));
  }
});

test('los errores no muestran la conexión, contraseña ni token', () => {
  try {
    assertTestingDeployConfig({ ...config, directUrl: config.directUrl.replace(':5432', ':6543') });
    assert.fail('Debe rechazar');
  } catch (error) {
    assert.ok(error instanceof Error);
    for (const value of [config.directUrl, 'password-simulado', config.railwayToken]) assert.ok(!error.message.includes(value));
  }
});
