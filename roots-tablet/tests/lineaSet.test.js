import test from 'node:test';
import assert from 'node:assert/strict';
import { lineaDelSet, svgLineaDelSet } from '../js/lineaSet.js';

const L = 'local';
const V = 'visitante';

test('la diferencia va punto a punto desde nuestro punto de vista', () => {
  const l = lineaDelSet([L, L, V, V, V, V, L], L);
  assert.deepEqual(l.diffs, [0, 1, 2, 1, 0, -1, -2, -1]);
  assert.deepEqual(l.final, [3, 4]);
  // si nuestro equipo es el visitante, se invierte
  assert.deepEqual(lineaDelSet([L, L, V], V).diffs, [0, -1, -2, -1]);
});

test('mayor ventaja, mayor desventaja y rachas con el marcador donde ocurren', () => {
  const l = lineaDelSet([L, L, L, V, V, V, V, V, L], L);
  assert.deepEqual([l.ventaja.valor, l.ventaja.marcador], [3, [3, 0]]);
  assert.deepEqual([l.desventaja.valor, l.desventaja.marcador], [-2, [3, 5]]);
  assert.deepEqual(l.rachaRival, { largo: 5, desde: 3, hasta: 8 });
  assert.deepEqual(l.marcador[l.rachaRival.desde], [3, 0]); // la racha rival empezó con 3-0
  assert.deepEqual(l.marcador[l.rachaRival.hasta], [3, 5]);
  assert.equal(l.rachaPropia.largo, 3);
});

test('si nunca se va ganando o perdiendo, no hay ventaja ni desventaja', () => {
  const l = lineaDelSet([V, V], L);
  assert.equal(l.ventaja, null);
  assert.equal(lineaDelSet([L, L], L).desventaja, null);
  assert.equal(lineaDelSet([], L).rachaRival, null);
});

test('la gráfica SVG se dibuja sin valores raros, resalta la racha del rival y no sirve sin puntos', () => {
  const l = lineaDelSet([L, V, V, V, V, L, L], L);
  const svg = svgLineaDelSet(l, { id: 'prueba' });
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes('ls-racha'));
  assert.ok(svg.includes('prueba-arriba') && svg.includes('prueba-abajo'));
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  assert.equal(svgLineaDelSet(lineaDelSet([], L)), '');
  // una racha corta (menos de 3) no se resalta
  assert.ok(!svgLineaDelSet(lineaDelSet([L, V, V, L], L)).includes('ls-racha'));
});
