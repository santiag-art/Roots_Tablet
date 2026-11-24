import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { alertasEnVivo, erroresSeguidosPorJugadora, rachaDePuntos } from '../js/rachas.js';
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

test('rachaDePuntos: cuenta los últimos puntos seguidos del mismo equipo', () => {
  assert.equal(rachaDePuntos([]), null);
  assert.deepEqual(rachaDePuntos([L, V, V, V]), { lado: V, largo: 3 });
  assert.deepEqual(rachaDePuntos([V, V, L]), { lado: L, largo: 1 });
});

test('erroresSeguidosPorJugadora: solo cuenta los errores al final y de ese fundamento', () => {
  const ev = [
    { jugadorId: 1, fundamento: 'Saque', calificacion: 'error' },
    { jugadorId: 1, fundamento: 'Ataque', calificacion: 'positivo' }, // otro fundamento: no corta la racha de saque
    { jugadorId: 1, fundamento: 'Saque', calificacion: 'error' },
    { jugadorId: 2, fundamento: 'Saque', calificacion: 'error' },
    { jugadorId: 2, fundamento: 'Saque', calificacion: 'positivo' },
    { jugadorId: 2, fundamento: 'Saque', calificacion: 'error' },
  ];
  assert.deepEqual([...erroresSeguidosPorJugadora(ev, 'Saque')], [[1, 2], [2, 1]]);
  assert.deepEqual([...erroresSeguidosPorJugadora(ev, 'Ataque')], []);
});

const base = { ladoPropio: L, nombres: { local: 'Roots', visitante: 'Halcones' }, enCancha: [1, 2, 3, 4, 5, 6], tmDisponibles: 2, nombreDe: (id) => `J${id}` };

test('racha del rival: avisa desde 3 (atención) y es urgente desde 4; con tiempos muertos disponibles lo sugiere', () => {
  assert.deepEqual(alertasEnVivo({ ...base, puntosSeq: [L, V, V] }), []);
  const a3 = alertasEnVivo({ ...base, puntosSeq: [L, V, V, V] });
  assert.equal(a3.length, 1);
  assert.deepEqual([a3[0].tipo, a3[0].nivel, a3[0].sugiereTiempoMuerto], ['racha-rival', 'atencion', true]);
  assert.match(a3[0].texto, /Halcones lleva 3 puntos seguidos/);
  const a4 = alertasEnVivo({ ...base, puntosSeq: [V, V, V, V] });
  assert.equal(a4[0].nivel, 'urgente');
  const sinTm = alertasEnVivo({ ...base, puntosSeq: [V, V, V, V], tmDisponibles: 0 });
  assert.equal(sinTm[0].sugiereTiempoMuerto, false);
  assert.match(sinTm[0].texto, /no te quedan tiempos muertos/);
});

test('una racha propia no genera alerta', () => {
  assert.deepEqual(alertasEnVivo({ ...base, puntosSeq: [V, L, L, L, L, L] }), []);
});

test('errores de saque seguidos: 2 atención, 3 urgente; solo si sigue en cancha', () => {
  const err = (jugadorId) => ({ jugadorId, fundamento: 'Saque', calificacion: 'error' });
  const dos = alertasEnVivo({ ...base, eventos: [err(2), err(2)] });
  assert.deepEqual([dos[0].tipo, dos[0].nivel, dos[0].jugadorId], ['errores', 'atencion', 2]);
  assert.match(dos[0].texto, /2 errores de saque seguidos de J2/);
  const tres = alertasEnVivo({ ...base, eventos: [err(2), err(2), err(2)] });
  assert.equal(tres[0].nivel, 'urgente');
  assert.deepEqual(alertasEnVivo({ ...base, enCancha: [1, 3, 4, 5, 6], eventos: [err(2), err(2), err(2)] }), []); // ya salió
  assert.deepEqual(alertasEnVivo({ ...base, eventos: [err(2), err(2), { jugadorId: 2, fundamento: 'Saque', calificacion: 'positivo' }] }), []);
});

test('errores de recepción y ataque avisan desde 3', () => {
  const e = (f) => ({ jugadorId: 5, fundamento: f, calificacion: 'error' });
  assert.deepEqual(alertasEnVivo({ ...base, eventos: [e('Recepción'), e('Recepción')] }), []);
  assert.equal(alertasEnVivo({ ...base, eventos: [e('Recepción'), e('Recepción'), e('Recepción')] })[0].nivel, 'atencion');
  assert.equal(alertasEnVivo({ ...base, eventos: [e('Ataque'), e('Ataque'), e('Ataque'), e('Ataque')] })[0].nivel, 'urgente');
});

test('las alertas urgentes salen primero', () => {
  const err = { jugadorId: 2, fundamento: 'Saque', calificacion: 'error' };
  const r = alertasEnVivo({ ...base, puntosSeq: [V, V, V, V], eventos: [err, err] }); // racha urgente, saque en atención
  assert.deepEqual(r.map((a) => a.nivel), ['urgente', 'atencion']);
});

test('motor: sumarPunto guarda quién anotó cada punto y deshacer lo quita', () => {
  const { est, ctx } = partidoListo();
  [L, V, V, V].forEach((lado) => M.sumarPunto(est, ctx, lado));
  assert.deepEqual(est.actual.puntosSeq, [L, V, V, V]);
  M.deshacerUltimaAccion(est);
  assert.deepEqual(est.actual.puntosSeq, [L, V, V]);
});

test('motor: quitar un punto a mano también lo saca de la racha, y deshacer lo devuelve a su lugar', () => {
  const { est, ctx } = partidoListo();
  [V, L, V, V].forEach((lado) => M.sumarPunto(est, ctx, lado));
  M.restarPunto(est, ctx, L); // el último movimiento no fue de L: es una resta manual
  assert.deepEqual(est.actual.puntosSeq, [V, V, V]);
  assert.equal(est.actual.puntosLocal, 0);
  M.deshacerUltimaAccion(est);
  assert.deepEqual(est.actual.puntosSeq, [V, L, V, V]);
  assert.equal(est.actual.puntosLocal, 1);
});

test('motor: la racha empieza de cero en cada set, y se conserva al reabrir el set', () => {
  const { est, ctx } = partidoListo();
  for (let i = 0; i < 25; i++) M.sumarPunto(est, ctx, L);
  M.guardarSet(est, ctx, 25, 0);
  assert.deepEqual(est.actual.puntosSeq, []);
  assert.equal(est.sets[0].puntosSeq.length, 25);
  M.reabrirUltimoSet(est);
  assert.equal(est.actual.puntosSeq.length, 25);
});

test('motor: un partido guardado antes de las rachas se abre con la secuencia vacía', () => {
  const { est } = partidoListo();
  delete est.actual.puntosSeq;
  assert.deepEqual(M.normalizarEstado(est).actual.puntosSeq, []);
});
