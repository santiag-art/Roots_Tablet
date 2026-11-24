import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretarSoltar } from '../js/soltar.js';
import * as M from '../js/motor.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

// Hace con el motor lo mismo que la pantalla de la plantilla al soltar.
function soltar(est, ctx, jugadorId, destino) {
  const d = M.derivados(est, ctx);
  const accion = interpretarSoltar({ confirmada: est.actual.plantillaConfirmada, d, slots: est.actual.slots, jugadorId, destino });
  if (!accion) return null;
  switch (accion.tipo) {
    case 'colocar': M.colocarEnPosicion(est, ctx, accion.jugadorId, accion.indice); break;
    case 'libero': M.colocarComoLibero(est, ctx, accion.jugadorId, accion.clave); break;
    case 'banca': M.devolverABanca(est, ctx, accion.jugadorId); break;
    case 'entrarLibero': M.entrarLibero(est, ctx, accion.liberoId, accion.saleId); break;
    case 'cambio': M.ejecutarSustitucion(est, ctx, accion.saleId, accion.entraId); break;
    default: break;
  }
  return accion;
}

function armando(modo = 'dos') {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, modo);
  return { est, ctx };
}

function confirmado() {
  const { est, ctx } = armando('dos');
  [1, 2, 3, 4, 5, 6].forEach((id, i) => soltar(est, ctx, id, `slot-${i}`));
  soltar(est, ctx, 7, 'libero-recepcion');
  soltar(est, ctx, 8, 'libero-defensa');
  M.confirmarPlantilla(est, ctx);
  return { est, ctx };
}

test('armar: soltar a alguien de la banca sobre una casilla la pone ahí', () => {
  const { est, ctx } = armando();
  const a = soltar(est, ctx, 9, 'slot-2');
  assert.equal(a.tipo, 'colocar');
  assert.equal(est.actual.slots[2], 9);
});

test('armar: soltar sobre una casilla ocupada cambia a las dos de lugar', () => {
  const { est, ctx } = armando();
  soltar(est, ctx, 1, 'slot-0');
  soltar(est, ctx, 2, 'slot-1');
  soltar(est, ctx, 1, 'slot-1');
  assert.deepEqual(est.actual.slots.slice(0, 2), [2, 1]);
});

test('armar: soltarla sobre una banca ocupada saca a la que estaba; sobre su propia casilla no hace nada', () => {
  const { est, ctx } = armando();
  soltar(est, ctx, 1, 'slot-0');
  assert.equal(soltar(est, ctx, 1, 'slot-0'), null);
  soltar(est, ctx, 9, 'slot-0');
  assert.equal(est.actual.slots[0], 9);
  assert.equal(est.actual.slots.includes(1), false, 'la que estaba vuelve a la banca');
});

test('armar: arrastrar a un cupo de líbero, y el que estaba ocupa el lugar de origen', () => {
  const { est, ctx } = armando();
  soltar(est, ctx, 7, 'libero-recepcion');
  assert.equal(est.actual.liberos.recepcion, 7);
  soltar(est, ctx, 3, 'slot-3');
  soltar(est, ctx, 3, 'libero-recepcion');
  assert.equal(est.actual.liberos.recepcion, 3);
  assert.equal(est.actual.slots[3], 7, 'el líbero anterior ocupa la casilla de origen');
});

test('armar: un cupo que no existe en este modo no hace nada', () => {
  const { est, ctx } = armando('uno');
  assert.equal(soltar(est, ctx, 7, 'libero-recepcion'), null);
  assert.equal(soltar(est, ctx, 7, 'libero-unico').tipo, 'libero');
  assert.equal(est.actual.liberos.unico, 7);
});

test('armar: arrastrar a la banca quita de la cancha o del cupo de líbero', () => {
  const { est, ctx } = armando();
  soltar(est, ctx, 1, 'slot-0');
  soltar(est, ctx, 7, 'libero-defensa');
  soltar(est, ctx, 1, 'banca');
  soltar(est, ctx, 7, 'banca');
  assert.equal(est.actual.slots[0], null);
  assert.equal(est.actual.liberos.defensa, null);
});

test('soltar fuera de todo destino o un destino raro no hace nada', () => {
  const { est, ctx } = armando();
  assert.equal(soltar(est, ctx, 1, null), null);
  assert.equal(soltar(est, ctx, 1, 'slot-9'), null);
  assert.equal(soltar(est, ctx, 1, 'slot-x'), null);
  assert.equal(soltar(est, ctx, 1, 'otra-cosa'), null);
  assert.equal(soltar(est, ctx, null, 'slot-0'), null);
  assert.deepEqual(est.actual.slots, [null, null, null, null, null, null]);
});

test('en juego: soltar a alguien de la banca sobre una casilla es un cambio', () => {
  const { est, ctx } = confirmado();
  const d = M.derivados(est, ctx);
  const a = interpretarSoltar({ confirmada: true, d, slots: est.actual.slots, jugadorId: 9, destino: 'slot-1' });
  assert.deepEqual(a, { tipo: 'cambio', saleId: 2, entraId: 9 });
  soltar(est, ctx, 9, 'slot-1');
  assert.equal(est.actual.slots[1], 9);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 1);
});

test('en juego: los cupos y la banca ya no reciben, y quien está en cancha no cambia de lugar', () => {
  const { est, ctx } = confirmado();
  assert.equal(soltar(est, ctx, 9, 'libero-recepcion'), null);
  assert.equal(soltar(est, ctx, 9, 'banca'), null);
  assert.equal(soltar(est, ctx, 1, 'slot-1'), null, 'ya está en cancha');
  assert.equal(soltar(est, ctx, 9, 'slot-0').tipo, 'cambio');
});

test('en juego: un líbero que está fuera entra soltándolo sobre una zaguera', () => {
  const { est, ctx } = confirmado();
  M.elegirSaque(est, 'visitante'); // el rival saca: puede entrar el líbero
  const a = soltar(est, ctx, 7, 'slot-4');
  assert.deepEqual(a, { tipo: 'entrarLibero', liberoId: 7, saleId: 5 });
  assert.equal(est.actual.slots[4], 7);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 0, 'no cuenta como cambio');
});

test('en juego: quien salió por el líbero, el líbero y quien no puede volver avisan en vez de cambiar', () => {
  const { est, ctx } = confirmado();
  M.elegirSaque(est, 'visitante');
  soltar(est, ctx, 7, 'slot-4'); // entra la líbero por la 5
  const d = M.derivados(est, ctx);
  const aviso = interpretarSoltar({ confirmada: true, d, slots: est.actual.slots, jugadorId: 5, destino: 'slot-1' });
  assert.equal(aviso.tipo, 'aviso');
  assert.match(aviso.texto, /fuera por el líbero/);
  const sobreLibero = interpretarSoltar({ confirmada: true, d, slots: est.actual.slots, jugadorId: 9, destino: 'slot-4' });
  assert.equal(sobreLibero.tipo, 'aviso');
  assert.match(sobreLibero.texto, /líbero no se sustituye/);
});

test('en juego: el motor sigue poniendo sus reglas (el líbero no sube a la delantera)', () => {
  const { est, ctx } = confirmado();
  M.elegirSaque(est, 'visitante');
  assert.throws(() => soltar(est, ctx, 7, 'slot-1'), /delantera/);
});
