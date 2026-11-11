import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visiblePages } from '../src/lib/pagination.ts';

test('paginación acotada sin duplicados al principio y al final', () => {
  assert.deepEqual(visiblePages(1, 1), [1]);
  assert.deepEqual(visiblePages(1, 2), [1, 2]);
  assert.deepEqual(visiblePages(1, 100), [1, 2, 100]);
  assert.deepEqual(visiblePages(100, 100), [1, 99, 100]);
});

test('la página activa conserva sus vecinas y los extremos, sin crecer con el total', () => {
  assert.deepEqual(visiblePages(50, 100), [1, 49, 50, 51, 100]);
  assert.deepEqual(visiblePages(3, 5), [1, 2, 3, 4, 5]);
  assert.equal(visiblePages(500_000, 1_000_000).length, 5);
});

test('no genera páginas fuera de los límites', () => {
  assert.deepEqual(visiblePages(1, 0), []);
  for (let total = 1; total <= 50; total += 1) {
    for (let page = 1; page <= total; page += 1) {
      const pages = visiblePages(page, total);
      assert.ok(pages.length <= 5);
      assert.ok(pages.includes(page));
      assert.ok(pages.every((value) => value >= 1 && value <= total));
      assert.equal(new Set(pages).size, pages.length);
    }
  }
});
