import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

// Alinea a 1..6 en P1..P6 y confirma, con el modo de líberos indicado.
function alinear(est, ctx, { modo = 'dos' } = {}) {
  M.cambiarModoLibero(est, modo);
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  if (modo === 'dos') {
    M.elegirLibero(est, ctx, 7, 'recepcion');
    M.elegirLibero(est, ctx, 8, 'defensa');
  } else if (modo === 'uno') {
    M.elegirLibero(est, ctx, 7, 'unico');
  }
  M.confirmarPlantilla(est, ctx);
}

test('plantilla: se llena en orden P1..P6 y exige líberos completos para confirmar', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, 'dos');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  assert.throws(() => M.confirmarPlantilla(est, ctx), /dos líberos/);
  M.elegirLibero(est, ctx, 7, 'recepcion');
  M.elegirLibero(est, ctx, 8, 'defensa');
  M.confirmarPlantilla(est, ctx);
  assert.equal(est.actual.plantillaConfirmada, true);
  assert.equal(est.actual.titulares.length, 8);
  assert.throws(() => M.toggleJugador(est, ctx, 9), /ya está confirmada/);
});

test('plantilla: una séptima jugadora no cabe y quitar a alguien libera su casilla', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  assert.throws(() => M.toggleJugador(est, ctx, 9), /solo pueden estar 6/);
  M.toggleJugador(est, ctx, 3);
  assert.equal(est.actual.slots[2], null);
  M.toggleJugador(est, ctx, 9);
  assert.equal(est.actual.slots[2], 9);
});

test('colocarEnPosicion intercambia con el ocupante', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.colocarEnPosicion(est, ctx, 5, 0); // 5 (P5) pasa a P1; 1 pasa a P5
  assert.deepEqual(est.actual.slots, [5, 2, 3, 4, 1, 6]);
  M.colocarEnPosicion(est, ctx, 9, 1); // viene de la banca: el ocupante vuelve a la banca
  assert.deepEqual(est.actual.slots, [5, 9, 3, 4, 1, 6]);
});

test('punto: quien recupera el saque rota; quien ya sacaba solo suma', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  assert.throws(() => M.sumarPunto(est, ctx, 'local'), /quién saca/);
  assert.equal(est.actual.puntosLocal, 0, 'el estado no queda a medias');
  M.elegirSaque(est, 'local');
  M.sumarPunto(est, ctx, 'local'); // ya sacábamos: solo suma
  assert.equal(est.actual.puntosLocal, 1);
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  M.sumarPunto(est, ctx, 'visitante'); // el rival recupera el saque: nosotros no rotamos
  assert.equal(est.actual.saca, 'visitante');
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  M.sumarPunto(est, ctx, 'local'); // recuperamos el saque: rotamos (P2 pasa a P1)
  assert.equal(est.actual.saca, 'local');
  assert.deepEqual(est.actual.slots, [2, 3, 4, 5, 6, 1]);
  assert.equal(est.actual.rotaciones, 1);
});

test('deshacer un punto con rotación devuelve marcador, saque y formación', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  M.elegirSaque(est, 'visitante');
  M.sumarPunto(est, ctx, 'local');
  assert.deepEqual(est.actual.slots, [2, 3, 4, 5, 6, 1]);
  M.deshacerUltimaAccion(est);
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  assert.equal(est.actual.puntosLocal, 0);
  assert.equal(est.actual.saca, 'visitante');
  assert.equal(est.actual.rotaciones, 0);
});

test('restar el punto recién sumado equivale a deshacerlo', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  M.elegirSaque(est, 'visitante');
  M.sumarPunto(est, ctx, 'local');
  M.restarPunto(est, ctx, 'local');
  assert.equal(est.actual.puntosLocal, 0);
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
});

test('cambios: máximo 6 por set y reingreso solo a su posición', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  M.ejecutarSustitucion(est, ctx, 1, 9);
  assert.deepEqual(est.actual.slots, [9, 2, 3, 4, 5, 6]);
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 2, 1), /solo puede volver a su posición/);
  M.ejecutarSustitucion(est, ctx, 9, 1); // la titular vuelve cambiando por quien la reemplazó
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 1, 9), /Esa suplente ya entró|ya salió y volvió/);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 2);
  M.ejecutarSustitucion(est, ctx, 2, 10);
  M.ejecutarSustitucion(est, ctx, 3, 11);
  M.ejecutarSustitucion(est, ctx, 4, 12);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 5);
});

test('cambios: la sexta pasa y la séptima se rechaza (sin dejar el estado a medias)', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'dos' });
  // Con dos líberos hay 4 en banca (9..12): 4 entradas + 2 reingresos = 6 cambios.
  M.ejecutarSustitucion(est, ctx, 1, 9);
  M.ejecutarSustitucion(est, ctx, 2, 10);
  M.ejecutarSustitucion(est, ctx, 3, 11);
  M.ejecutarSustitucion(est, ctx, 4, 12);
  M.ejecutarSustitucion(est, ctx, 9, 1);
  M.ejecutarSustitucion(est, ctx, 10, 2);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 6);
  const antes = structuredClone(est);
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 5, 9), /6 sustituciones/);
  assert.deepEqual(est, antes);
});

test('cambio excepcional: solo cuando no hay sustitución legal, no cuenta y la jugadora no vuelve', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 1, 9, { excepcional: true }), /sí es legal como sustitución normal/);
  M.ejecutarSustitucion(est, ctx, 1, 9);
  // 9 ya entró: solo puede salir por la titular 1. Si 9 se lesiona, el cambio es excepcional con otra suplente.
  M.ejecutarSustitucion(est, ctx, 9, 10, { excepcional: true });
  assert.equal(est.actual.slots[0], 10);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 1);
  assert.equal(M.derivados(est, ctx).salieronExcepcionalIds.has(9), true);
});

test('líbero: entra por P5/P6, no por la delantera ni por P1 si sacamos; salir devuelve a quien reemplazó', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  M.elegirSaque(est, 'visitante'); // recibimos
  assert.throws(() => M.entrarLibero(est, ctx, 7, 3), /delantera/); // 3 está en P3
  M.entrarLibero(est, ctx, 7, 5); // P5
  assert.equal(est.actual.slots[4], 7);
  assert.equal(M.derivados(est, ctx).sustitucionesUsadas, 0, 'el líbero no cuenta como sustitución');
  assert.equal(M.derivados(est, ctx).reemplazados.get(7), 5);
  // regla 19.3.2.1: no se puede salir sin una jugada completa entre los dos cambios
  assert.throws(() => M.salirLibero(est, ctx, 7), /jugada completa/);
  M.sumarPunto(est, ctx, 'visitante');
  M.salirLibero(est, ctx, 7);
  assert.equal(est.actual.slots[4], 5);
});

test('líbero: por P1 solo mientras recibimos y exige haber elegido quién saca', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  assert.throws(() => M.entrarLibero(est, ctx, 7, 1), /quién saca/);
  M.elegirSaque(est, 'local');
  assert.throws(() => M.entrarLibero(est, ctx, 7, 1), /sacando/);
  M.elegirSaque(est, 'visitante');
  M.entrarLibero(est, ctx, 7, 1);
  assert.equal(est.actual.slots[0], 7);
});

test('rotación: el líbero que llega a la delantera sale solo y vuelve quien reemplazó', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  M.elegirSaque(est, 'visitante');
  M.entrarLibero(est, ctx, 7, 5); // líbero en P5 (índice 4)
  M.sumarPunto(est, ctx, 'visitante'); // una jugada completa
  M.sumarPunto(est, ctx, 'local'); // recuperamos el saque: rotamos, y P5 pasa a P4 -> el líbero sale
  assert.ok(!est.actual.slots.includes(7), 'el líbero ya no está en cancha');
  assert.ok(est.actual.slots.includes(5), 'vuelve quien había reemplazado');
  assert.equal(ctx.avisos.some((a) => a.tipo === 'libero'), true);
  // un solo "Deshacer" revierte punto, rotación y salida del líbero
  M.deshacerUltimaAccion(est);
  assert.equal(est.actual.slots[4], 7);
  assert.equal(est.actual.puntosLocal, 0);
});

test('líberos: de recepción a defensa es un cambio directo y hereda a la jugadora que estaba fuera', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'dos' });
  M.elegirSaque(est, 'visitante');
  M.entrarLibero(est, ctx, 7, 6); // LR por P6 (índice 5)
  M.sumarPunto(est, ctx, 'visitante');
  M.entrarLibero(est, ctx, 8, 7); // LD por LR
  assert.equal(est.actual.slots[5], 8);
  assert.equal(M.derivados(est, ctx).reemplazados.get(8), 6);
  assert.equal(M.derivados(est, ctx).reemplazados.has(7), false);
});

test('nuevo líbero (19.4): el líbero lesionado sale, no vuelve a jugar y la designada queda de líbero', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  M.elegirSaque(est, 'visitante');
  M.entrarLibero(est, ctx, 7, 5);
  M.designarNuevoLibero(est, ctx, 7, 9);
  const d = M.derivados(est, ctx);
  assert.equal(est.actual.liberos.unico, 9);
  assert.ok(est.actual.slots.includes(5), 'quien estaba reemplazada vuelve a cancha');
  assert.equal(d.inhabilitadosLibero.has(7), true);
  assert.equal(d.jugadoresBanca.some((j) => j.id === 7), false, '7 ya no puede volver a jugar');
  assert.throws(() => M.ejecutarSustitucion(est, ctx, 1, 7), /no apto como líbero/);
  // deshacer devuelve a la líbero anterior a su cupo
  M.deshacerUltimaAccion(est);
  assert.equal(est.actual.liberos.unico, 7);
  assert.equal(M.derivados(est, ctx).inhabilitadosLibero.has(7), false);
});

test('nuevo líbero: si queda otro líbero disponible se rechaza y el estado no cambia', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'dos' });
  const antes = structuredClone(est);
  assert.throws(() => M.designarNuevoLibero(est, ctx, 7, 9), /otro líbero/);
  assert.deepEqual(est, antes);
});

test('jugadas: el líbero no saca ni bloquea; la posición limita los fundamentos', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  assert.throws(() => M.registrarJugada(est, ctx, 7, 'Saque', 'positivo'), /regla 19.3.1.3/);
  assert.throws(() => M.registrarJugada(est, ctx, 4, 'Recepción', 'positivo'), /no se le registra recepción; solo: ataque, bloqueo, defensa, saque/); // opuesta no recibe
  const e = M.registrarJugada(est, ctx, 7, 'Recepción', 'doble_positivo');
  assert.equal(e.jugadorId, 7);
  const b = M.registrarJugada(est, ctx, 3, 'Bloqueo', 'doble_positivo', { bloqueoEnConjunto: true });
  assert.equal(b.enConjunto, true);
  const c = M.registrarJugada(est, ctx, 1, 'Colocación', 'positivo', { paseRecibido: 'bueno' });
  assert.equal(c.paseRecibido, 'bueno');
  const a = M.registrarJugada(est, ctx, 2, 'Ataque', 'positivo', { paseRecibido: 'bueno', bloqueoEnConjunto: true });
  assert.equal(a.paseRecibido, null);
  assert.equal(a.enConjunto, false);
  assert.deepEqual(M.statsJugador(est, 7), { doble_positivo: 1, positivo: 0, negativo: 0, error: 0 });
});

test('jugadas: avisa si saca alguien que no está en P1 (sin bloquear la jugada)', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  M.elegirSaque(est, 'local');
  M.registrarJugada(est, ctx, 2, 'Saque', 'positivo'); // saca la de P2, no la de P1
  assert.equal(ctx.avisos.filter((a) => a.tipo === 'posicion').length, 1);
  assert.equal(est.actual.eventos.length, 1);
});

test('deshacer jugada: quita el evento y su entrada del historial', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'ninguno' });
  M.registrarJugada(est, ctx, 2, 'Ataque', 'positivo');
  M.registrarJugada(est, ctx, 3, 'Bloqueo', 'error');
  M.deshacerUltimaJugada(est);
  assert.equal(est.actual.eventos.length, 1);
  assert.equal(est.actual.historial.length, 1);
  M.deshacerUltimaAccion(est);
  assert.equal(est.actual.eventos.length, 0);
});

test('tiempos muertos: máximo 2 por equipo y por set', () => {
  const est = estadoNuevo();
  M.pedirTiempoMuerto(est, 'local');
  M.pedirTiempoMuerto(est, 'local');
  assert.throws(() => M.pedirTiempoMuerto(est, 'local'), /2 tiempos muertos/);
  M.corregirTiempoMuerto(est, 'local');
  M.pedirTiempoMuerto(est, 'local');
  assert.deepEqual(est.actual.tiemposMuertos, { local: 2, visitante: 0 });
});

test('cerrar set: valida el marcador, alterna el primer saque y deja la plantilla por confirmar', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'uno' });
  M.elegirSaque(est, 'local');
  M.registrarJugada(est, ctx, 2, 'Ataque', 'positivo');
  assert.throws(() => M.guardarSet(est, ctx, 25, 24), /2 puntos de diferencia/);
  assert.throws(() => M.guardarSet(est, ctx, 20, 10), /al menos 25/);
  assert.throws(() => M.guardarSet(est, ctx, 28, 25), /exactamente con 2 de diferencia/);
  M.guardarSet(est, ctx, 25, 20);
  assert.equal(est.sets.length, 1);
  assert.equal(est.sets[0].eventos.length, 1);
  assert.equal(est.sets[0].titulares.length, 7);
  assert.equal(est.actual.plantillaConfirmada, false);
  assert.equal(est.actual.saca, 'visitante', 'el primer saque se alterna');
  assert.equal(est.actual.modoLibero, 'uno', 'los líberos se conservan para el set siguiente');
  assert.equal(est.actual.liberos.unico, 7);
  assert.deepEqual(est.actual.slots, [1, 2, 3, 4, 5, 6]);
  assert.equal(est.actual.puntosLocal + est.actual.puntosVisitante, 0);
});

test('partido: se decide con los sets necesarios y no admite más sets; el decisivo es a 15', () => {
  const est = estadoNuevo({ formatoSets: 'mejor_de_3' });
  const ctx = crearContexto();
  M.guardarSet(est, ctx, 25, 20);
  M.guardarSet(est, ctx, 18, 25);
  assert.equal(M.partidoDecidido(est), false);
  assert.equal(M.derivados(est, ctx).esSetDecisivo, true);
  assert.throws(() => M.guardarSet(est, ctx, 25, 10), /necesita al menos 15|exactamente|Pasando de 15/);
  M.guardarSet(est, ctx, 15, 12);
  assert.equal(M.partidoDecidido(est), true);
  assert.throws(() => M.guardarSet(est, ctx, 25, 10), /solo puede haber sets del 1 al 3|ya está decidido/); // Roots valida primero el marcador y luego el orden
});

test('terminar partido: exige al menos un set', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  assert.throws(() => M.terminarPartido(est), /al menos un set/);
  M.guardarSet(est, ctx, 25, 10);
  M.terminarPartido(est);
  assert.equal(M.estaTerminado(est), true);
});

test('formato: se puede elegir mientras no haya sets y después ya no cambia', () => {
  const est = estadoNuevo({ formatoSets: null });
  const ctx = crearContexto();
  assert.throws(() => M.guardarSet(est, ctx, 25, 10), /Define primero el formato/);
  M.elegirFormato(est, 'mejor_de_5');
  M.guardarSet(est, ctx, 25, 10);
  M.elegirFormato(est, 'mejor_de_3');
  assert.equal(est.formatoSets, 'mejor_de_5');
});

test('cambio de cancha en el set decisivo al llegar a 8 puntos', () => {
  const est = estadoNuevo({ formatoSets: 'mejor_de_3' });
  const ctx = crearContexto();
  M.guardarSet(est, ctx, 25, 20);
  M.guardarSet(est, ctx, 20, 25);
  est.actual.puntosLocal = 8;
  assert.equal(M.derivados(est, ctx).pideCambioCancha, true);
  M.marcarCambioCanchaHecho(est);
  assert.equal(M.derivados(est, ctx).pideCambioCancha, false);
});

test('el estado se puede guardar como JSON y retomar igual', () => {
  const est = estadoNuevo();
  const ctx = crearContexto();
  alinear(est, ctx, { modo: 'dos' });
  M.elegirSaque(est, 'visitante');
  M.entrarLibero(est, ctx, 7, 6);
  M.sumarPunto(est, ctx, 'visitante');
  const copia = M.normalizarEstado(JSON.parse(JSON.stringify(est)));
  assert.deepEqual(copia, est);
  M.deshacerUltimaAccion(copia);
  assert.equal(copia.actual.puntosVisitante, 0);
});

test('no aptas: se listan para pedir confirmación al armar la alineación', () => {
  const est = estadoNuevo();
  const ctx = crearContexto({ lesiones: new Map([[2, { disponibilidad: 'no_apta', zonas: ['Rodilla'] }], [3, { disponibilidad: 'limitada', zonas: [] }]]) });
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  assert.deepEqual(M.alineadosNoAptos(est, ctx).map((j) => j.id), [2]);
});

test('corregir el marcador de un set guardado valida toda la secuencia', async () => {
  const { corregirMarcadorSet, guardarSet, nuevoEstadoPartido, elegirFormato, setsComoMarcador } = await import('../js/motor.js');
  const { crearContexto } = await import('./ayuda.js');
  const est = nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  guardarSet(est, ctx, 25, 20);
  guardarSet(est, ctx, 25, 23);
  assert.throws(() => corregirMarcadorSet(est, 1, 25, 24), /2 puntos de diferencia/);
  assert.equal(est.sets[0].puntosVisitante, 20, 'queda como estaba');
  corregirMarcadorSet(est, 1, 20, 25); // ahora gana el visitante el primero: 1-1 y el partido sigue
  assert.deepEqual(setsComoMarcador(est)[0], { local: 20, visitante: 25 });
  assert.throws(() => corregirMarcadorSet(est, 9, 25, 0), /no está guardado/);
});

test('reabrir el último set devuelve marcador, jugadas y formación', async () => {
  const m = await import('../js/motor.js');
  const { crearContexto, JUGADORAS } = await import('./ayuda.js');
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.cambiarModoLibero(est, 'uno');
  m.elegirLibero(est, ctx, 7, 'unico');
  m.confirmarPlantilla(est, ctx);
  m.elegirSaque(est, 'local');
  m.registrarJugada(est, ctx, 1, 'Saque', 'positivo');
  m.ejecutarSustitucion(est, ctx, 2, 9);
  m.guardarSet(est, ctx, 25, 10);
  m.reabrirUltimoSet(est);
  assert.equal(est.sets.length, 0);
  assert.equal(est.actual.puntosLocal, 25);
  assert.equal(est.actual.eventos.length, 1);
  assert.equal(est.actual.slots.includes(9), true);
  assert.equal(est.actual.slots.includes(2), false);
  assert.equal(est.actual.liberos.unico, 7);
  assert.equal(est.actual.plantillaConfirmada, true);
  // un set siguiente con datos impide reabrir
  m.guardarSet(est, ctx, 25, 10);
  est.actual.puntosLocal = 3;
  assert.throws(() => m.reabrirUltimoSet(est), /ya tiene datos/);
  assert.ok(JUGADORAS.length);
});

test('reabrir el set devuelve la rotación y el saque exactos con que se cerró', async () => {
  const m = await import('../js/motor.js');
  const { crearContexto } = await import('./ayuda.js');
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.confirmarPlantilla(est, ctx);
  m.elegirSaque(est, 'visitante');
  m.sumarPunto(est, ctx, 'local'); // recuperamos el saque: rota
  m.sumarPunto(est, ctx, 'visitante');
  m.sumarPunto(est, ctx, 'local'); // rota otra vez
  m.sumarPunto(est, ctx, 'local');
  const antes = { slots: [...est.actual.slots], rotaciones: est.actual.rotaciones, saca: est.actual.saca, primero: est.actual.primerSaque };
  assert.equal(antes.rotaciones, 2);
  m.guardarSet(est, ctx, 25, 10);
  assert.equal(m.cierreExactoDelSet(est.sets[0]), true);
  const r = m.reabrirUltimoSet(est);
  assert.deepEqual(r, { exacta: true, rotaciones: 2, saca: 'local' });
  assert.deepEqual(est.actual.slots, antes.slots);
  assert.equal(est.actual.rotaciones, antes.rotaciones);
  assert.equal(est.actual.saca, 'local');
  assert.equal(est.actual.primerSaque, antes.primero);
  assert.equal(est.actual.plantillaConfirmada, true);
  // Seguir anotando: rotar hacia atrás y volver a guardar conserva la alternancia del primer saque
  m.guardarSet(est, ctx, 25, 10);
  assert.equal(est.actual.saca, 'local', 'el set 2 lo abre quien no abrió el set 1');
});

test('reabrir con el líbero en cancha conserva su posición y quién reemplazó', async () => {
  const m = await import('../js/motor.js');
  const { crearContexto } = await import('./ayuda.js');
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.cambiarModoLibero(est, 'uno');
  m.elegirLibero(est, ctx, 7, 'unico');
  m.confirmarPlantilla(est, ctx);
  m.elegirSaque(est, 'visitante');
  m.entrarLibero(est, ctx, 7, est.actual.slots[4]);
  const slotsAntes = [...est.actual.slots];
  m.guardarSet(est, ctx, 25, 10);
  m.reabrirUltimoSet(est);
  assert.deepEqual(est.actual.slots, slotsAntes);
  assert.equal(est.actual.slots.includes(7), true);
  assert.equal(m.derivados(est, ctx).reemplazados.get(7), 5);
});

test('un set guardado antes de esta versión (sin cierre) se reabre como antes', async () => {
  const m = await import('../js/motor.js');
  const { crearContexto } = await import('./ayuda.js');
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.confirmarPlantilla(est, ctx);
  m.elegirSaque(est, 'local');
  m.guardarSet(est, ctx, 25, 10);
  delete est.sets[0].cierre;
  const r = m.reabrirUltimoSet(est);
  assert.equal(r.exacta, false);
  assert.equal(est.actual.rotaciones, 0);
  assert.equal(est.actual.saca, null);
});

test('el cierre del set no viaja en el archivo de resultados', async () => {
  const m = await import('../js/motor.js');
  const { construirResultados } = await import('../js/exportar.js');
  const { crearContexto } = await import('./ayuda.js');
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'X' });
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.confirmarPlantilla(est, ctx);
  m.guardarSet(est, ctx, 25, 10);
  const res = construirResultados({ registros: [{ id: 1, torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'X', fecha: '2026-11-22', hora: '09:00', est }], ids: [1] });
  assert.equal('cierre' in res.partidos[0].sets[0], false);
});
