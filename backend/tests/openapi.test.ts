import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openApiDocument, publicOperations } from '../src/docs/openapi.js';

const SRC = join('src');

type Json = Record<string, unknown>;

function collectRouteOperations(): Set<string> {
  const appSource = readFileSync(join(SRC, 'app.ts'), 'utf8');

  const mounts = new Map<string, string>();
  for (const m of appSource.matchAll(/app\.use\(['"]([^'"]+)['"],\s*(\w+Routes)\)/g)) {
    mounts.set(m[2], m[1]);
  }

  const operations = new Set<string>();
  const add = (method: string, path: string): void => {
    const normalized = path.replace(/\/+$/, '') || '/';
    operations.add(`${method.toUpperCase()} ${normalized.replace(/:([A-Za-z_]+)/g, '{$1}')}`);
  };

  for (const m of appSource.matchAll(/app\.get\(['"]([^'"]+)['"]/g)) {
    add('get', m[1]);
  }

  for (const m of appSource.matchAll(/import (\w+Routes) from '\.\/modules\/([^']+)\.js'/g)) {
    const prefix = mounts.get(m[1]);
    assert.ok(prefix !== undefined, `No se encontró el mount de ${m[1]} en app.ts`);
    const file = join(SRC, 'modules', `${m[2]}.ts`);
    const source = readFileSync(file, 'utf8');
    for (const r of source.matchAll(/router\.(get|post|patch|put|delete)\(['"]([^'"]+)['"]/g)) {
      add(r[1], prefix + r[2]);
    }
  }

  return operations;
}

const specOperations = new Set<string>();
for (const [path, ops] of Object.entries(openApiDocument.paths)) {
  for (const method of Object.keys(ops as Json)) {
    specOperations.add(`${method.toUpperCase()} ${path}`);
  }
}

test('la spec tiene estructura OpenAPI 3.1 válida', () => {
  assert.equal(openApiDocument.openapi, '3.1.0');
  assert.equal(typeof openApiDocument.info?.title, 'string');
  assert.ok(Array.isArray(openApiDocument.servers) && openApiDocument.servers.length > 0);
  assert.ok(Array.isArray(openApiDocument.tags) && openApiDocument.tags.length > 0);
  assert.ok(openApiDocument.components?.securitySchemes?.cookieAuth, 'falta securityScheme cookieAuth');
  assert.ok(openApiDocument.paths && Object.keys(openApiDocument.paths).length > 0);
});

test('toda operación de los routers está documentada', () => {
  const routed = collectRouteOperations();
  const missing: string[] = [];
  for (const operation of routed) {
    if (!specOperations.has(operation)) missing.push(operation);
  }
  assert.deepEqual(missing, [], 'Operaciones sin documentar');
});

test('no hay operaciones documentadas que no existan en los routers', () => {
  const routed = collectRouteOperations();
  const ghost: string[] = [];
  for (const operation of specOperations) {
    if (!routed.has(operation)) ghost.push(operation);
  }
  assert.deepEqual(ghost, [], 'Operaciones documentadas que no existen');
});

test('cada operación declara security y coincide con ser pública o no', () => {
  const publicKeys = new Set(publicOperations.map((o) => `${o.method.toUpperCase()} ${o.path}`));
  for (const [path, ops] of Object.entries(openApiDocument.paths)) {
    for (const [method, operation] of Object.entries((ops as Json) ?? {})) {
      const entry = operation as Json;
      const key = `${method.toUpperCase()} ${path}`;
      assert.ok(entry.security, `${key} sin campo security`);
      if (publicKeys.has(key)) {
        assert.deepEqual(entry.security, [], `${key} debería ser pública (sin security)`);
      } else {
        assert.deepEqual(entry.security, [{ cookieAuth: [] }], `${key} debería requerir cookie gh_token`);
      }
    }
  }
});

test('todas las operaciones públicas declaradas existen en la spec', () => {
  for (const { path, method } of publicOperations) {
    const ops = openApiDocument.paths[path];
    assert.ok(ops, `Falta la operación pública ${method.toUpperCase()} ${path}`);
    assert.ok((ops as Json)[method], `Falta la operación pública ${method.toUpperCase()} ${path}`);
  }
  assert.ok(publicOperations.length >= 8, 'Se esperaban al menos 8 operaciones públicas');
});

test('toda operación tiene respuestas con status de HTTP válidos', () => {
  for (const ops of Object.values(openApiDocument.paths as Record<string, Json>)) {
    for (const operation of Object.values((ops as Json) ?? {})) {
      const entry = operation as Json;
      const responses = entry.responses as Json;
      assert.ok(responses, `${entry.summary} sin campo responses`);
      const keys = Object.keys(responses);
      assert.ok(keys.length > 0, `${entry.summary} sin respuestas`);
      for (const status of keys) {
        assert.match(status, /^[1-5]\d\d$|^default$/, `status HTTP inválido "${status}" en "${entry.summary}"`);
      }
    }
  }
});

test('todos los $ref a componentes resuelven', () => {
  const schemas = openApiDocument.components?.schemas as Json;
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const record = value as Json;
    const ref = record.$ref;
    if (typeof ref === 'string') {
      const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
      assert.ok(m, `$ref con formato inesperado: ${ref}`);
      assert.ok(schemas[m[1]], `$ref a componente inexistente: ${m[1]}`);
    }
    Object.values(record).forEach(walk);
  };
  walk(openApiDocument);
});