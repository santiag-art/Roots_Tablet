import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { posicionDeJuego, posicionEstandar, abreviaturaPosicion, posicionValida } from '../js/posicionPartido.js';
import { construirResultados } from '../js/exportar.js';
import { resumenDePartido } from '../js/estadisticas.js';
import { crearContexto, estadoNuevo, JUGADORAS } from './ayuda.js';

const porId = new Map(JUGADORAS.map((j) => [j.id, j]));

function armar(est, ctx, posiciones = {}) {
  M.cambiarModoLibero(est, 'uno');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id, { posicion: posiciones[id] ?? null }));
  M.elegirLibero(est, ctx, 7, 'unico');
  M.confirmarPlantilla(est, ctx);
}

test('sin elegir nada, juega con la posición de su ficha', () => {
  const est = estadoNuevo();
  assert.equal(posicionDeJuego(est, porId.get(2)), 'Atacante');
  assert.equal(posicionDeJuego(est, porId.get(1)), 'Colocación');
  assert.deepEqual(est.posiciones, {});
});

test('al entrar a la plantilla se guarda la posición elegida y manda sobre la ficha', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.toggleJugador(est, ctx, 2, { posicion: 'Central' }); // la punta juega de central hoy
  assert.equal(est.posiciones[2], 'Central');
  assert.equal(M.derivados(est, ctx).posicionDe(2), 'Central');
  M.colocarEnPosicion(est, ctx, 5, 3, { posicion: 'Ataque opuesto' });
  assert.equal(est.posiciones[5], 'Ataque opuesto');
});

test('se aceptan nombres con género y se guardan con el nombre estándar', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.toggleJugador(est, ctx, 2, { posicion: 'Colocadora' });
  assert.equal(est.posiciones[2], 'Colocación');
  assert.equal(posicionEstandar('opuesta'), 'Ataque opuesto');
  assert.equal(abreviaturaPosicion('Central'), 'Cen');
  assert.equal(abreviaturaPosicion('Portera'), '');
  assert.equal(posicionValida(null), true);
  assert.equal(posicionValida('Portera'), false);
});

test('una posición inválida se rechaza y no deja nada a medias', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  assert.throws(() => M.toggleJugador(est, ctx, 2, { posicion: 'Portera' }), /posición no es válida/);
  assert.equal(est.actual.slots.includes(2), false);
  assert.deepEqual(est.posiciones, {});
  assert.throws(() => M.colocarEnPosicion(est, ctx, 2, 0, { posicion: 'Portera' }), /posición no es válida/);
  assert.throws(() => M.elegirPosicion(est, ctx, 2, null), /posición no es válida/);
});

test('elegirPosicion cambia la posición sin mover a la jugadora, y solo con la plantilla abierta', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.elegirPosicion(est, ctx, 4, 'Central');
  assert.equal(est.posiciones[4], 'Central');
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  M.cambiarModoLibero(est, 'uno');
  M.elegirLibero(est, ctx, 7, 'unico');
  M.confirmarPlantilla(est, ctx);
  assert.throws(() => M.elegirPosicion(est, ctx, 4, 'Atacante'), /ya está confirmada/);
});

test('al confirmar, cada titular guarda con qué posición juega (el líbero no)', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Central' });
  const fila = (id) => est.actual.titulares.find((t) => t.jugadorId === id);
  assert.equal(fila(2).posicionJugada, 'Central'); // la elegida
  assert.equal(fila(5).posicionJugada, 'Atacante'); // la de su ficha
  assert.equal(fila(1).posicionJugada, 'Colocación');
  assert.equal(fila(2).posicion, 2); // la casilla sigue siendo la casilla
  assert.equal(fila(7).esLibero, true);
  assert.equal(fila(7).posicionJugada, null);
});

test('un cambio guarda con qué posición entra y deshacer la devuelve', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx);
  const sub = M.ejecutarSustitucion(est, ctx, 3, 9, { posicion: 'Central' }); // Isa (punta) entra de central
  assert.equal(sub.posicionEntra, 'Central');
  assert.equal(est.posiciones[9], 'Central');
  M.deshacerUltimaAccion(est);
  assert.equal(est.posiciones[9], undefined);
  assert.equal(est.actual.sustituciones.length, 0);
});

test('deshacer un cambio devuelve la posición anterior si ya tenía una elegida', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx);
  est.posiciones[9] = 'Ataque opuesto';
  M.ejecutarSustitucion(est, ctx, 3, 9, { posicion: 'Central' });
  assert.equal(est.posiciones[9], 'Central');
  M.deshacerUltimaAccion(est);
  assert.equal(est.posiciones[9], 'Ataque opuesto');
});

test('un cambio sin elegir posición usa la que ya tenía o la de su ficha', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx);
  assert.equal(M.ejecutarSustitucion(est, ctx, 3, 10).posicionEntra, 'Central'); // Juli, ficha Central
  assert.equal(est.posiciones[10], undefined); // no se inventa una elección
});

test('un cambio inválido no deja ni la posición ni el cambio', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx);
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 3, 3, { posicion: 'Central' }), /sí misma|sí mismo/);
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 3, 9, { posicion: 'Portera' }), /posición no es válida/);
  assert.deepEqual(est.posiciones, {});
  assert.equal(est.actual.sustituciones.length, 0);
});

test('los cambios y las entradas de líbero no llevan posición', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx);
  M.elegirSaque(est, 'visitante'); // recibimos: el líbero puede entrar por una zaguera
  const sub = M.entrarLibero(est, ctx, 7, 6);
  assert.equal(sub.porLibero, true);
  assert.equal(sub.posicionEntra, undefined);
});

test('los fundamentos permitidos siguen la posición del partido, no la de la ficha', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Colocación' }); // la punta arma hoy
  // La colocación (el pase) es solo de la posición Colocación: antes del cambio de posición se rechazaba para Bea.
  assert.doesNotThrow(() => M.registrarJugada(est, ctx, 2, 'Colocación', 'positivo'));
  // Ana (ficha Colocación) ahora no coloca: juega de central y no tiene ese fundamento.
  const est2 = estadoNuevo();
  const ctx2 = crearContexto();
  armar(est2, ctx2, { 1: 'Central' });
  assert.throws(() => M.registrarJugada(est2, ctx2, 1, 'Colocación', 'positivo'), /posición Central/);
  assert.doesNotThrow(() => M.registrarJugada(est2, ctx2, 1, 'Bloqueo', 'positivo'));
});

test('el archivo de resultados lleva posicionJugada y posicionEntra con los nombres que Roots espera', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Central' });
  M.ejecutarSustitucion(est, ctx, 3, 9, { posicion: 'Ataque opuesto' });
  M.elegirSaque(est, 'visitante');
  est.actual.puntosLocal = 25;
  est.actual.puntosVisitante = 20;
  M.guardarSet(est, ctx, 25, 20);
  const registro = { id: 10, torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'Rivales', fecha: '2026-11-22', hora: '09:00:00', est };
  const salida = construirResultados({ registros: [registro], ids: [10], ahora: new Date('2026-11-22T12:00:00Z') });
  const set = salida.partidos[0].sets[0];
  const titular = (id) => set.titulares.find((t) => t.jugadorId === id);
  assert.equal(titular(2).posicionJugada, 'Central');
  assert.equal(titular(5).posicionJugada, 'Atacante');
  assert.equal(titular(2).posicion, 2);
  assert.equal(titular(7).posicionJugada, null);
  assert.equal(set.sustituciones[0].posicionEntra, 'Ataque opuesto');
});

test('un partido guardado antes de esta versión sigue funcionando con las posiciones de las fichas', () => {
  const est = estadoNuevo();
  delete est.posiciones;
  assert.ok(M.normalizarEstado(est));
  assert.deepEqual(est.posiciones, {});
  const ctx = crearContexto();
  const viejo = estadoNuevo();
  delete viejo.posiciones;
  M.toggleJugador(viejo, ctx, 2); // sin pregunta: ficha
  assert.equal(M.derivados(viejo, ctx).posicionDe(2), 'Atacante');
});

test('estadísticas: la jugadora se agrupa en la posición con que jugó el partido', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Central' });
  M.registrarJugada(est, ctx, 2, 'Bloqueo', 'doble_positivo');
  M.registrarJugada(est, ctx, 5, 'Ataque', 'positivo');
  const r = resumenDePartido(est, porId, 'todo');
  assert.equal(r.jugadoras.find((j) => j.id === 2).grupo, 'central');
  assert.equal(r.jugadoras.find((j) => j.id === 5).grupo, 'atacante');
});

test('reabrir el último set devuelve las posiciones con que se jugó', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Central' });
  M.guardarSet(est, ctx, 25, 20);
  // el set 2 empieza con la misma cancha; en su plantilla nueva se cambia la posición de Bea
  M.elegirPosicion(est, ctx, 2, 'Colocación');
  assert.equal(est.posiciones[2], 'Colocación');
  M.reabrirUltimoSet(est);
  assert.equal(est.posiciones[2], 'Central');
});

test('la posición elegida sigue en el set siguiente sin volver a preguntar', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  armar(est, ctx, { 2: 'Central' });
  M.guardarSet(est, ctx, 25, 20);
  M.confirmarPlantilla(est, ctx);
  assert.equal(est.actual.titulares.find((t) => t.jugadorId === 2).posicionJugada, 'Central');
});
