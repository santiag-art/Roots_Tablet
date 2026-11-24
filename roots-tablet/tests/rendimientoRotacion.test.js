import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { rendimientoPorRotacion } from '../js/rendimientoRotacion.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

const L = 'local';
const V = 'visitante';

function partidoListo() {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, 'ninguno');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, L);
  return { est, ctx };
}

test('el motor guarda la rotación y el saque de cada punto, y rota solo al recuperar el saque', () => {
  const { est, ctx } = partidoListo();
  [L, V, L, L, V, V].forEach((lado) => M.sumarPunto(est, ctx, lado));
  assert.deepEqual(est.actual.puntosInfo, [
    { rot: 0, saca: L }, { rot: 0, saca: L }, { rot: 0, saca: V }, // R1: ganamos sacando, perdimos sacando, side-out
    { rot: 1, saca: L }, { rot: 1, saca: L }, { rot: 1, saca: V }, // R2
  ]);
});

test('rendimiento por rotación: puntos, saque, side-out y recepción de cada una', () => {
  const { est, ctx } = partidoListo();
  ['positivo', 'error', 'error'].forEach((c) => M.registrarJugada(est, ctx, 2, 'Recepción', c)); // en R1
  [L, V, L].forEach((lado) => M.sumarPunto(est, ctx, lado)); // el último es side-out: pasa a R2
  ['doble_positivo', 'positivo', 'positivo'].forEach((c) => M.registrarJugada(est, ctx, 2, 'Recepción', c)); // en R2
  [L, V, V].forEach((lado) => M.sumarPunto(est, ctx, lado));
  const r = rendimientoPorRotacion(est);
  const [r1, r2] = r.filas;
  assert.deepEqual([r1.ganados, r1.perdidos, r1.diferencia], [2, 1, 1]);
  assert.deepEqual([r1.saque.ganados, r1.saque.total, r1.sideOut.ganados, r1.sideOut.total], [1, 2, 1, 1]);
  assert.deepEqual([r2.ganados, r2.perdidos], [1, 2]);
  assert.deepEqual([r2.saque.total, r2.sideOut.total, r2.sideOut.ganados], [2, 1, 0]);
  assert.equal(r1.recepcion.total, 3);
  assert.equal(r1.recepcion.efectividad, 1 / 3);
  assert.equal(r2.recepcion.efectividad, 1);
  assert.equal(r.peorRecepcion, 1);
  assert.equal(r.sinRotacion, 0);
  assert.equal(r.hayDatos, true);
});

test('deshacer y quitar un punto a mano mantienen la rotación de cada punto bien alineada', () => {
  const { est, ctx } = partidoListo();
  [L, V, L].forEach((lado) => M.sumarPunto(est, ctx, lado));
  M.deshacerUltimaAccion(est);
  assert.equal(est.actual.puntosInfo.length, est.actual.puntosSeq.length);
  assert.equal(est.actual.rotaciones, 0);
  M.sumarPunto(est, ctx, L); // rota otra vez
  M.sumarPunto(est, ctx, L);
  M.restarPunto(est, ctx, V); // resta manual: el último movimiento no fue de V
  assert.equal(est.actual.puntosInfo.length, est.actual.puntosSeq.length);
  assert.deepEqual(est.actual.puntosSeq, [L, L, L]);
  M.deshacerUltimaAccion(est);
  assert.equal(est.actual.puntosInfo.length, 4);
  assert.equal(est.actual.puntosInfo[1].saca, L); // el punto de V que se había quitado vuelve a su lugar con sus datos
});

test('marca la rotación donde más se pierde y la que peor recibe, solo con datos suficientes', () => {
  const info = (rot, saca) => ({ rot, saca });
  const est = {
    ladoPropio: L,
    sets: [],
    actual: {
      puntosSeq: [L, L, L, L, V, V, V, V, V, L],
      puntosInfo: [info(0, L), info(0, L), info(0, L), info(0, L), info(1, V), info(1, V), info(1, V), info(1, L), info(1, L), info(1, V)],
      eventos: [0, 0, 0, 1, 1, 1].map((rotacion, i) => ({ fundamento: 'Recepción', calificacion: i < 3 ? 'positivo' : 'error', rotacion })),
    },
  };
  const r = rendimientoPorRotacion(est);
  assert.equal(r.masDebil, 2);
  assert.equal(r.peorRecepcion, 2);
  // con una sola rotación con datos suficientes no se señala ninguna
  est.actual.puntosInfo = est.actual.puntosInfo.map(() => info(0, L));
  est.actual.eventos = est.actual.eventos.map((e) => ({ ...e, rotacion: 0 }));
  const una = rendimientoPorRotacion(est);
  assert.equal(una.masDebil, null);
  assert.equal(una.peorRecepcion, null);
});

test('los puntos sin rotación (versiones anteriores) no se cuentan y se avisan', () => {
  const est = { ladoPropio: L, sets: [], actual: { puntosSeq: [L, V], puntosInfo: [{ rot: null, saca: null }, { rot: null, saca: null }], eventos: [] } };
  const r = rendimientoPorRotacion(est);
  assert.equal(r.sinRotacion, 2);
  assert.equal(r.hayDatos, false);
});

test('el alcance elige un set cerrado o el set en juego', () => {
  const { est, ctx } = partidoListo();
  for (let i = 0; i < 25; i++) M.sumarPunto(est, ctx, L);
  M.guardarSet(est, ctx, 25, 0);
  assert.equal(rendimientoPorRotacion(est, 1).filas.reduce((a, f) => a + f.total, 0), 25);
  assert.equal(rendimientoPorRotacion(est, 'actual').hayDatos, false);
  assert.equal(rendimientoPorRotacion(est, 'todo').filas.reduce((a, f) => a + f.total, 0), 25);
});

test('un partido guardado sin puntosInfo se arregla al abrirlo', () => {
  const { est, ctx } = partidoListo();
  [L, V].forEach((lado) => M.sumarPunto(est, ctx, lado));
  delete est.actual.puntosInfo;
  const n = M.normalizarEstado(est);
  assert.deepEqual(n.actual.puntosInfo, [{ rot: null, saca: null }, { rot: null, saca: null }]);
});
