import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const raiz = new URL('..', import.meta.url).pathname;
const listar = (dir) => readdirSync(join(raiz, dir)).flatMap((f) => (statSync(join(raiz, dir, f)).isDirectory() ? listar(join(dir, f)) : [join(dir, f)]));

test('el service worker guarda todos los archivos de la app', () => {
  const sw = readFileSync(join(raiz, 'sw.js'), 'utf8');
  const faltan = ['css', 'icons', 'img', 'js'].flatMap(listar).concat(['index.html', 'manifest.webmanifest']).filter((f) => !sw.includes(`'${f}'`));
  assert.deepEqual(faltan, []);
});

test('el manifiesto es instalable', () => {
  const m = JSON.parse(readFileSync(join(raiz, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
  assert.equal(m.start_url, './');
});
