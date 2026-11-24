import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { contar, porcentaje, resumenDePartido } from '../js/estadisticas.js';
import { JUGADORAS, crearContexto, estadoNuevo } from './ayuda.js';

const porId = new Map(JUGADORAS.map((j) => [j.id, j]));

function partidoConJugadas() {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, 'dos');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.elegirLibero(est, ctx, 7, 'recepcion');
  M.elegirLibero(est, ctx, 8, 'defensa');
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, 'local');
  M.registrarJugada(est, ctx, 2, 'Ataque', 'doble_positivo');
  M.registrarJugada(est, ctx, 2, 'Ataque', 'error');
  M.registrarJugada(est, ctx, 7, 'Recepción', 'positivo');
  for (let i = 0; i < 25; i++) M.sumarPunto(est, ctx, 'local');
  M.guardarSet(est, ctx, 25, 0);
  return { est, ctx };
}

test('contar: efectividad = (++ y +) sobre el total, o null sin jugadas', () => {
  const r = contar([{ calificacion: 'doble_positivo' }, { calificacion: 'positivo' }, { calificacion: 'negativo' }, { calificacion: 'error' }]);
  assert.deepEqual([r.total, r.efectividad], [4, 0.5]);
  assert.equal(contar([]).efectividad, null);
  assert.equal(porcentaje(null), '–');
  assert.equal(porcentaje(0.666), '67%');
});

test('resumen: totales por equipo, por fundamento y por jugadora (líbero en su grupo)', () => {
  const { est } = partidoConJugadas();
  const r = resumenDePartido(est, porId, 'todo');
  assert.equal(r.equipo.total, 3);
  assert.equal(r.fundamentos.find((f) => f.fundamento === 'Ataque').total, 2);
  const bea = r.jugadoras.find((j) => j.id === 2);
  assert.deepEqual([bea.total, bea.doble_positivo, bea.error, bea.efectividad], [2, 1, 1, 0.5]);
  assert.equal(bea.grupo, 'atacante');
  assert.equal(r.jugadoras.find((j) => j.id === 7).grupo, 'libero');
  assert.equal(r.sets.length, 1);
  assert.equal(r.sets[0].puntosLocal, 25);
});

test('resumen: el alcance filtra por set y el set en juego aparece solo si tiene datos', () => {
  const { est, ctx } = partidoConJugadas();
  assert.equal(resumenDePartido(est, porId, 1).equipo.total, 3);
  assert.equal(resumenDePartido(est, porId, 'actual').equipo.total, 0);
  assert.equal(resumenDePartido(est, porId, 'todo').sets.some((s) => s.enJuego), false);
  M.elegirSaque(est, 'visitante');
  M.sumarPunto(est, ctx, 'visitante');
  const r = resumenDePartido(est, porId, 'todo');
  assert.equal(r.sets.at(-1).enJuego, true);
  assert.equal(resumenDePartido(est, porId, 9).equipo.total, 0);
});
