import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { miniEstadistica } from '../js/estadisticas.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

function partido() {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, 'uno');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.elegirLibero(est, ctx, 7, 'unico');
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, 'local');
  return { est, ctx };
}

test('mini-estadística: ataque y recepción con efectividad, saque con directos y errores', () => {
  const { est, ctx } = partido();
  const j = (f, c, id = 2) => M.registrarJugada(est, ctx, id, f, c);
  j('Ataque', 'doble_positivo'); j('Ataque', 'positivo'); j('Ataque', 'error'); j('Ataque', 'negativo');
  j('Recepción', 'positivo'); j('Recepción', 'error');
  j('Saque', 'doble_positivo'); j('Saque', 'doble_positivo'); j('Saque', 'error');
  j('Ataque', 'positivo', 5); // otra jugadora: no cuenta
  const m = miniEstadistica(est, 2);
  assert.equal(m.set.ataque.total, 4);
  assert.equal(m.set.ataque.efectividad, 0.5);
  assert.equal(m.set.recepcion.efectividad, 0.5);
  assert.deepEqual([m.set.saque.directos, m.set.saque.errores, m.set.saque.total], [2, 1, 3]);
});

test('mini-estadística: "Set" es solo el set en juego y "Partido" suma los sets cerrados', () => {
  const { est, ctx } = partido();
  M.registrarJugada(est, ctx, 2, 'Ataque', 'doble_positivo');
  for (let i = 0; i < 25; i++) M.sumarPunto(est, ctx, 'local');
  M.guardarSet(est, ctx, 25, 0);
  const antes = miniEstadistica(est, 2);
  assert.equal(antes.set.ataque.total, 0);
  assert.equal(antes.set.ataque.efectividad, null);
  assert.equal(antes.partido.ataque.total, 1);
});

test('mini-estadística: a una líbero no se le muestra ataque ni saque', () => {
  const { est } = partido();
  const m = miniEstadistica(est, 7, ['Recepción', 'Defensa']);
  assert.deepEqual(Object.keys(m.set), ['recepcion']);
});
