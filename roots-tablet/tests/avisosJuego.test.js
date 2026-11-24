import test from 'node:test';
import assert from 'node:assert/strict';
import { avisosActivados, bajoElLimite, cambiosDelSet, guardarAvisosActivados, liberoPuedeEntrar, liberosQueSaldran } from '../js/avisosJuego.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('cambios que quedan en el set y su nivel', () => {
  assert.deepEqual([0, 3, 4, 5, 6].map((u) => cambiosDelSet({ usados: u, maximo: 6 }).restantes), [6, 3, 2, 1, 0]);
  assert.equal(cambiosDelSet({ usados: 4, maximo: 6 }).texto, 'Quedan 2 cambios');
  assert.equal(cambiosDelSet({ usados: 5, maximo: 6 }).texto, 'Queda 1 cambio');
  assert.equal(cambiosDelSet({ usados: 6, maximo: 6 }).texto, 'Sin cambios');
  assert.deepEqual([2, 3, 5].map((u) => cambiosDelSet({ usados: u, maximo: 6 }).nivel), ['ok', 'ok', 'poco']);
  assert.equal(cambiosDelSet({ usados: 6, maximo: 6 }).nivel, 'ninguno');
  assert.equal(cambiosDelSet({ usados: 9, maximo: 6 }).restantes, 0);
});

test('solo avisa cuando bajan a 2, 1 o 0', () => {
  assert.equal(bajoElLimite(3, 2), true);
  assert.equal(bajoElLimite(1, 0), true);
  assert.equal(bajoElLimite(4, 3), false);
  assert.equal(bajoElLimite(2, 3), false); // deshacer
  assert.equal(bajoElLimite(2, 2), false);
  assert.equal(bajoElLimite(undefined, 2), false);
});

// slots: P1..P6. Líbero 99 reemplazó a la 5.
test('la líbero sale en la próxima rotación si está en P5 y estamos recibiendo', () => {
  const slots = [1, 2, 3, 4, 99, 6]; // 99 en P5 (índice 4)
  const reemplazados = new Map([[99, 5]]);
  const r = liberosQueSaldran({ slots, idsLibero: [99], reemplazados, sacamos: false });
  assert.deepEqual(r, [{ liberoId: 99, vuelveId: 5, posicion: 5 }]);
  assert.deepEqual(liberosQueSaldran({ slots, idsLibero: [99], reemplazados, sacamos: true }), []); // sacando: no rota ya
  assert.deepEqual(liberosQueSaldran({ slots, idsLibero: [99], reemplazados, sacamos: null }), []);
});

test('la líbero en P6 o P1 no sale en la próxima rotación', () => {
  const reemplazados = new Map([[99, 5]]);
  assert.deepEqual(liberosQueSaldran({ slots: [1, 2, 3, 4, 5, 99], idsLibero: [99], reemplazados, sacamos: false }), []);
  assert.deepEqual(liberosQueSaldran({ slots: [99, 2, 3, 4, 5, 6], idsLibero: [99], reemplazados, sacamos: false }), []);
});

const jugadores = new Map([[1, { posicion: 'Colocación' }], [2, { posicion: 'Atacante' }], [3, { posicion: 'Central' }], [4, { posicion: 'Ataque opuesto' }], [5, { posicion: 'Atacante' }], [6, { posicion: 'Central' }]]);
const base = { idsLibero: [99], jugadoresPorId: jugadores, ultimoCambio: null, puntosLocal: 3, puntosVisitante: 2 };

test('la líbero puede entrar por una central en la zaguera', () => {
  const r = liberoPuedeEntrar({ ...base, slots: [1, 2, 3, 4, 5, 6], sacamos: false }); // central 6 en P6
  assert.deepEqual(r, { liberoId: 99, saleId: 6, posicion: 6 });
});

test('no sugiere entrar si la central está en la delantera, si no se sabe quién saca o si la líbero ya está', () => {
  assert.equal(liberoPuedeEntrar({ ...base, slots: [1, 3, 2, 4, 5, 2], sacamos: false })?.saleId, undefined);
  assert.equal(liberoPuedeEntrar({ ...base, slots: [1, 2, 3, 4, 5, 6], sacamos: null }), null);
  assert.equal(liberoPuedeEntrar({ ...base, slots: [1, 2, 3, 4, 5, 99], sacamos: false }), null);
});

test('quien saca (P1) no se cambia por la líbero', () => {
  const slots = [6, 2, 1, 4, 5, 2]; // central 6 sacando en P1
  assert.equal(liberoPuedeEntrar({ ...base, slots: [6, 2, 1, 4, 5, 4], sacamos: true }), null);
  assert.equal(liberoPuedeEntrar({ ...base, slots, sacamos: false })?.saleId, 6);
});

test('respeta la jugada completa entre dos cambios de líbero', () => {
  const ultimoCambio = { puntosLocal: 3, puntosVisitante: 2 };
  assert.equal(liberoPuedeEntrar({ ...base, slots: [1, 2, 3, 4, 5, 6], sacamos: false, ultimoCambio }), null); // mismo marcador
  assert.ok(liberoPuedeEntrar({ ...base, slots: [1, 2, 3, 4, 5, 6], sacamos: false, ultimoCambio, puntosLocal: 4 }));
});

test('los avisos vienen activados y se pueden apagar', () => {
  const a = memoria();
  assert.equal(avisosActivados(a), true);
  guardarAvisosActivados(false, a);
  assert.equal(avisosActivados(a), false);
  guardarAvisosActivados(true, a);
  assert.equal(avisosActivados(a), true);
  assert.equal(avisosActivados({ getItem: () => '{roto' }), true);
});
