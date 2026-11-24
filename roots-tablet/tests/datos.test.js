import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerArchivoRoots, aplicarImportacion, ErrorImportacion, tieneProgreso } from '../js/importar.js';
import { construirResultados, nombreArchivoResultados, resultadoDePartido } from '../js/exportar.js';
import { crearAlmacen, crearRespaldoMemoria } from '../js/store.js';
import * as M from '../js/motor.js';
import { comparacionConRoots, estadoDePartido, textoDeEstado, tieneSetSinTerminar } from '../js/resumen.js';

const MUESTRA = readFileSync(new URL('./fixtures/muestra-roots.json', import.meta.url), 'utf8');
const nuevoAlmacen = () => crearAlmacen(crearRespaldoMemoria());
const ctxDe = (jugadores) => ({ jugadores, lesiones: new Map(), ahora: () => new Date('2026-11-22T10:00:00Z'), avisar() {} });

// ───────────── leerArchivoRoots ─────────────

test('leer: el archivo que genera Roots es válido', () => {
  const datos = leerArchivoRoots(MUESTRA);
  assert.equal(datos.idExportacion, 'exp-muestra-0001');
  assert.equal(datos.torneos.length, 2);
  assert.equal(datos.partidos.length, 3);
  assert.equal(datos.jugadores.length, 26);
  assert.deepEqual(datos.lesiones.map((l) => [l.jugadorId, l.disponibilidad]), [[4, 'limitada'], [14, 'no_apta']]);
  assert.equal(datos.partidos.find((p) => p.id === 11).setsGuardados, 1);
});

test('leer: tolera el BOM que a veces agregan WhatsApp o Drive', () => {
  assert.equal(leerArchivoRoots(`﻿${MUESTRA}`).partidos.length, 3);
});

test('leer: mensajes claros cuando el archivo no sirve', () => {
  const malo = (texto, patron) => assert.throws(() => leerArchivoRoots(texto), (e) => e instanceof ErrorImportacion && patron.test(e.message));
  malo('esto no es json {', /no es un JSON válido/);
  malo('[]', /no es de Roots/);
  malo(JSON.stringify({ aplicacion: 'otra-cosa', version: 1 }), /no es de Roots/);
  malo(JSON.stringify({ aplicacion: 'roots-tablet-resultados', version: 1 }), /resultados de la tablet/);
  const base = JSON.parse(MUESTRA);
  malo(JSON.stringify({ ...base, version: 99 }), /versión más nueva/);
  malo(JSON.stringify({ ...base, version: undefined }), /de qué versión/);
  malo(JSON.stringify({ ...base, idExportacion: '' }), /identificador/);
  malo(JSON.stringify({ ...base, partidos: undefined }), /falta la lista de partidos/);
  malo(JSON.stringify({ ...base, partidos: [] }), /ningún partido/);
  malo(JSON.stringify({ ...base, partidos: [{ ...base.partidos[0], torneoId: 999 }] }), /torneo que no viene/);
  malo(JSON.stringify({ ...base, jugadores: base.jugadores.filter((j) => j.genero === 'masculino') }), /no trae jugadores femeninos para "Copa Pereira Femenina"/);
  malo(JSON.stringify({ ...base, partidos: [{ ...base.partidos[0], formatoSets: 'mejor_de_9' }] }), /formato de sets/);
});

test('leer: ignora lesiones de jugadores que no vienen y deduce la disponibilidad', () => {
  const base = JSON.parse(MUESTRA);
  base.lesiones = [{ jugadorId: 4, gravedad: 'grave' }, { jugadorId: 9999, gravedad: 'leve' }, { jugadorId: 5, gravedad: 'leve', disponibilidad: 'rara' }];
  const datos = leerArchivoRoots(JSON.stringify(base));
  assert.deepEqual(datos.lesiones.map((l) => [l.jugadorId, l.disponibilidad]), [[4, 'no_apta'], [5, 'limitada']]);
});

// ───────────── aplicarImportacion ─────────────

test('importar: guarda partidos, torneos, jugadores y lesiones', async () => {
  const almacen = nuevoAlmacen();
  const resumen = await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA), { nombreArchivo: 'roots-tablet-2026-11-22.json' });
  assert.deepEqual({ nuevos: resumen.nuevos, actualizados: resumen.actualizados, conservados: resumen.conservados, yaImportado: resumen.yaImportado }, { nuevos: 3, actualizados: 0, conservados: 0, yaImportado: false });
  assert.equal(resumen.partidosConSetsEnRoots, 1);
  assert.equal((await almacen.todos('partidos')).length, 3);
  assert.equal((await almacen.todos('jugadores')).length, 26);
  assert.equal((await almacen.todos('torneos')).length, 2);
  const lesionesJ4 = await almacen.uno('lesiones', 4);
  assert.equal(lesionesJ4.lesiones[0].disponibilidad, 'limitada');
  const p10 = await almacen.uno('partidos', 10);
  assert.equal(p10.setsEnRoots, 0);
  assert.equal(estadoDePartido(p10), 'pendiente');
  assert.equal(p10.est.ladoPropio, 'local');
  assert.equal((await almacen.uno('partidos', 11)).est.ladoPropio, 'visitante', 'Roots es visitante en el partido 11');
  assert.equal((await almacen.uno('partidos', 11)).setsEnRoots, 1);
  assert.equal((await almacen.uno('partidos', 20)).est.formatoSets, 'mejor_de_5');
  assert.equal((await almacen.uno('importaciones', 'exp-muestra-0001')).nombreArchivo, 'roots-tablet-2026-11-22.json');
});

test('importar: volver a importar el mismo archivo no duplica nada ni pisa lo anotado', async () => {
  const almacen = nuevoAlmacen();
  const datos = leerArchivoRoots(MUESTRA);
  await aplicarImportacion(almacen, datos);

  // se anota algo en el partido 10
  const p10 = await almacen.uno('partidos', 10);
  M.elegirFormato(p10.est, 'mejor_de_3');
  M.guardarSet(p10.est, ctxDe([]), 25, 20);
  await almacen.guardar('partidos', p10);
  assert.equal(tieneProgreso(p10), true);

  const resumen = await aplicarImportacion(almacen, datos);
  assert.equal(resumen.yaImportado, true);
  assert.deepEqual({ nuevos: resumen.nuevos, actualizados: resumen.actualizados, conservados: resumen.conservados }, { nuevos: 0, actualizados: 2, conservados: 1 });
  assert.equal((await almacen.todos('partidos')).length, 3);
  const despues = await almacen.uno('partidos', 10);
  assert.equal(despues.est.sets.length, 1, 'el set anotado se conserva');
  assert.equal(despues.est.sets[0].puntosLocal, 25);
});

test('importar: otro archivo actualiza fecha y hora, pero un partido ya anotado conserva lo suyo', async () => {
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const p10 = await almacen.uno('partidos', 10);
  M.elegirFormato(p10.est, 'mejor_de_3');
  M.guardarSet(p10.est, ctxDe([]), 25, 20);
  await almacen.guardar('partidos', p10);

  const cambiado = JSON.parse(MUESTRA);
  cambiado.idExportacion = 'exp-muestra-0002';
  cambiado.partidos = cambiado.partidos.map((p) => (p.id === 10 ? { ...p, hora: '15:00:00', equipoVisitante: 'Otro nombre', setsGuardados: 2 } : p));
  const resumen = await aplicarImportacion(almacen, leerArchivoRoots(cambiado));
  assert.equal(resumen.yaImportado, false);
  const despues = await almacen.uno('partidos', 10);
  assert.equal(despues.hora, '15:00:00');
  assert.equal(despues.setsEnRoots, 2);
  assert.equal(despues.equipoVisitante, 'Águilas', 'no se renombra un partido ya empezado');
  assert.deepEqual(despues.importadoDe, ['exp-muestra-0001', 'exp-muestra-0002']);
});

test('importar: las lesiones se reemplazan por las del archivo nuevo (si ya se recuperó, desaparece)', async () => {
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const nuevo = JSON.parse(MUESTRA);
  nuevo.idExportacion = 'exp-muestra-0003';
  nuevo.lesiones = [{ jugadorId: 14, zona: 'Hombro', gravedad: 'leve', disponibilidad: 'apta' }];
  await aplicarImportacion(almacen, leerArchivoRoots(nuevo));
  assert.deepEqual((await almacen.uno('lesiones', 4)).lesiones, []);
  assert.equal((await almacen.uno('lesiones', 14)).lesiones[0].disponibilidad, 'apta');
});

// ───────────── exportar resultados ─────────────

async function partidoJugado() {
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const jugadores = (await almacen.todos('jugadores')).filter((j) => j.genero === 'femenino');
  const ctx = ctxDe(jugadores);
  const reg = await almacen.uno('partidos', 10);
  const est = reg.est;
  M.elegirFormato(est, 'mejor_de_3');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.cambiarModoLibero(est, 'uno');
  M.elegirLibero(est, ctx, 7, 'unico');
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, 'local');
  M.sumarPunto(est, ctx, 'local');
  M.registrarJugada(est, ctx, 2, 'Ataque', 'doble_positivo');
  M.ejecutarSustitucion(est, ctx, 6, 10);
  M.guardarSet(est, ctx, 25, 20);
  M.guardarSet(est, ctx, 25, 18);
  M.terminarPartido(est);
  reg.est = est;
  return { almacen, reg, ctx };
}

test('exportar: el archivo de resultados trae sets, titulares, cambios y jugadas con los nombres de Roots', async () => {
  const { reg } = await partidoJugado();
  const ahora = new Date('2026-11-22T15:30:00Z');
  const res = construirResultados({ registros: [reg], ids: [10], ahora });
  assert.equal(res.aplicacion, 'roots-tablet-resultados');
  assert.equal(res.version, 1);
  assert.deepEqual(res.exportacionesDeOrigen, ['exp-muestra-0001']);
  assert.equal(res.exportadoEn, '2026-11-22T15:30:00.000Z');
  assert.ok(res.idResultados);
  const p = res.partidos[0];
  assert.equal(p.id, 10);
  assert.equal(p.formatoSets, 'mejor_de_3');
  assert.equal(p.finalizadoManual, true);
  assert.equal(p.sets.length, 2);
  assert.deepEqual(p.sets.map((s) => [s.numeroSet, s.puntosLocal, s.puntosVisitante]), [[1, 25, 20], [2, 25, 18]]);
  const s1 = p.sets[0];
  assert.equal(s1.titulares.length, 7);
  assert.deepEqual(s1.titulares.filter((t) => t.esLibero).map((t) => [t.jugadorId, t.tipoLibero]), [[7, 'unico']]);
  assert.deepEqual(s1.titulares.filter((t) => !t.esLibero).map((t) => [t.jugadorId, t.posicion]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6]]);
  assert.deepEqual(s1.sustituciones.map((s) => [s.jugadorSaleId, s.jugadorEntraId, s.porLibero, s.excepcional, s.nuevoLibero]), [[6, 10, false, false, false]]);
  assert.deepEqual(s1.eventos.map((e) => [e.jugadorId, e.fundamento, e.calificacion, e.enConjunto, e.paseRecibido]), [[2, 'Ataque', 'doble_positivo', false, null]]);
  assert.equal(s1.eventos[0].orden < 100, true);
  assert.equal(p.eventosSinSet, undefined);
  // no viajan los ids internos de la tablet con ese nombre, y el JSON sobrevive a ida y vuelta
  assert.equal(JSON.stringify(res).includes('"siguienteId"'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(res)), res);
});

test('exportar: solo van los partidos marcados que tienen sets; sin ninguno da un error claro', async () => {
  const { reg, almacen } = await partidoJugado();
  const sinEmpezar = await almacen.uno('partidos', 20);
  const res = construirResultados({ registros: [reg, sinEmpezar], ids: [10, 20] });
  assert.deepEqual(res.partidos.map((p) => p.id), [10]);
  assert.throws(() => construirResultados({ registros: [sinEmpezar], ids: [20] }), /al menos un partido con sets/);
  assert.throws(() => construirResultados({ registros: [reg], ids: [] }), /al menos un partido con sets/);
});

test('exportar: las jugadas de un set sin cerrar viajan aparte y no se pierden', async () => {
  const { reg, ctx } = await partidoJugado();
  const r = await (async () => {
    const copia = structuredClone(reg);
    copia.est.finalizado = false;
    copia.est.sets.pop(); // vuelve a quedar un solo set
    // el set siguiente conserva la cancha y el líbero del anterior (como en Roots): solo se confirma
    M.confirmarPlantilla(copia.est, ctx);
    M.registrarJugada(copia.est, ctx, 3, 'Bloqueo', 'positivo');
    return copia;
  })();
  assert.equal(estadoDePartido(r), 'en_juego');
  assert.equal(tieneSetSinTerminar(r), true);
  assert.match(textoDeEstado(r), /En juego · set 2/);
  const p = resultadoDePartido(r);
  assert.equal(p.finalizadoManual, false);
  assert.equal(p.sets.length, 1);
  assert.deepEqual(p.eventosSinSet.map((e) => [e.jugadorId, e.fundamento]), [[3, 'Bloqueo']]);
});

test('exportar: nombre del archivo con la fecha local', () => {
  assert.equal(nombreArchivoResultados(new Date(2026, 10, 22, 9, 30)), 'roots-resultados-2026-11-22.json');
  assert.equal(nombreArchivoResultados(new Date(2026, 0, 5)), 'roots-resultados-2026-01-05.json');
});

// ───────────── resumen y almacén ─────────────

test('resumen: estados de un partido', async () => {
  const { reg, almacen } = await partidoJugado();
  assert.equal(estadoDePartido(reg), 'terminado');
  assert.match(textoDeEstado(reg), /Terminado · sets 2-0/);
  assert.equal(estadoDePartido(await almacen.uno('partidos', 20)), 'pendiente');
  assert.equal(textoDeEstado(await almacen.uno('partidos', 20)), 'Sin empezar');
});

test('almacén: guarda copias (lo guardado no cambia si luego se modifica el objeto) y borra', async () => {
  const almacen = nuevoAlmacen();
  const fila = { id: 1, lista: [1, 2] };
  await almacen.guardar('partidos', fila);
  fila.lista.push(3);
  assert.deepEqual((await almacen.uno('partidos', 1)).lista, [1, 2]);
  await almacen.borrar('partidos', 1);
  assert.equal(await almacen.uno('partidos', 1), null);
  await almacen.guardarVarios('partidos', [{ id: 2 }, { id: 3 }]);
  await almacen.borrarVarios('partidos', [2, 3]);
  assert.deepEqual(await almacen.todos('partidos'), []);
});

test('almacén: las escrituras se aplican en orden y un fallo se reporta sin trabar la cola', async () => {
  let llamadas = [];
  const respaldo = crearRespaldoMemoria();
  const guardarOriginal = respaldo.guardar;
  respaldo.guardar = async (tabla, filas) => {
    llamadas.push(filas[0].v);
    if (filas[0].v === 2) throw new Error('disco lleno');
    return guardarOriginal(tabla, filas);
  };
  const almacen = crearAlmacen(respaldo);
  const fallos = [];
  almacen.alFallar = (e) => fallos.push(e.message);
  const a = almacen.guardar('partidos', { id: 1, v: 1 });
  const b = almacen.guardar('partidos', { id: 1, v: 2 }).catch(() => {});
  const c = almacen.guardar('partidos', { id: 1, v: 3 });
  await Promise.all([a, b, c]);
  await almacen.pendientes();
  assert.deepEqual(llamadas, [1, 2, 3]);
  assert.deepEqual(fallos, ['disco lleno']);
  assert.equal((await almacen.uno('partidos', 1)).v, 3);
});

// ───────────── comparar con lo que ya tiene Roots ─────────────

test('leer: trae el marcador de cada set de Roots (opcional) y descarta lo inválido', () => {
  const datos = leerArchivoRoots(MUESTRA);
  assert.deepEqual(datos.partidos.find((p) => p.id === 11).marcadoresRoots, [{ numeroSet: 1, puntosLocal: 25, puntosVisitante: 22 }]);
  assert.deepEqual(datos.partidos.find((p) => p.id === 10).marcadoresRoots, [], 'un archivo sin setsRoots sigue sirviendo');

  const base = JSON.parse(MUESTRA);
  base.partidos = base.partidos.map((p) => (p.id === 10 ? { ...p, setsGuardados: 0, setsRoots: [{ numeroSet: 2, puntosLocal: 18, puntosVisitante: 25 }, { puntosLocal: 25, puntosVisitante: 20 }, { numeroSet: 3, puntosLocal: 'x', puntosVisitante: 5 }, null, { puntosLocal: -1, puntosVisitante: 3 }] } : p));
  const p10 = leerArchivoRoots(JSON.stringify(base)).partidos.find((p) => p.id === 10);
  assert.deepEqual(p10.marcadoresRoots.map((s) => [s.numeroSet, s.puntosLocal, s.puntosVisitante]), [[1, 18, 25], [2, 25, 20]], 'si falta algún número de set se numeran por orden');
  assert.equal(p10.setsGuardados, 2, 'si hay marcadores, la cantidad de sets sale de ellos');

  base.partidos = base.partidos.map((p) => (p.id === 10 ? { ...p, setsRoots: [{ numeroSet: 2, puntosLocal: 18, puntosVisitante: 25 }, { numeroSet: 1, puntosLocal: 25, puntosVisitante: 20 }] } : p));
  const ordenados = leerArchivoRoots(JSON.stringify(base)).partidos.find((p) => p.id === 10);
  assert.deepEqual(ordenados.marcadoresRoots.map((s) => [s.numeroSet, s.puntosLocal]), [[1, 25], [2, 18]], 'con números, se ordenan por set');
});

test('comparar: marcador de Roots frente al de la tablet', async () => {
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  assert.equal(comparacionConRoots(await almacen.uno('partidos', 10)), null, 'Roots no tiene sets de ese partido');

  const p11 = await almacen.uno('partidos', 11);
  let c = comparacionConRoots(p11);
  assert.equal(c.roots.texto, '25-22');
  assert.deepEqual([c.roots.local, c.roots.visitante], [1, 0]);
  assert.equal(c.hayTablet, false);
  assert.equal(c.iguales, null);

  M.elegirFormato(p11.est, 'mejor_de_3');
  M.guardarSet(p11.est, ctxDe([]), 25, 22);
  c = comparacionConRoots(p11);
  assert.equal(c.iguales, true);
  assert.equal(c.tablet.texto, '25-22');

  p11.est.sets[0].puntosLocal = 21;
  p11.est.sets[0].puntosVisitante = 25;
  c = comparacionConRoots(p11);
  assert.equal(c.iguales, false);
  assert.deepEqual([c.tablet.local, c.tablet.visitante], [0, 1]);
});

test('comparar: un archivo viejo (solo la cantidad de sets) avisa que no hay detalle', async () => {
  const base = JSON.parse(MUESTRA);
  base.partidos = base.partidos.map((p) => (p.id === 11 ? { ...p, setsRoots: undefined } : p));
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(JSON.stringify(base)));
  const c = comparacionConRoots(await almacen.uno('partidos', 11));
  assert.equal(c.detalle, false);
  assert.equal(c.cantidadRoots, 1);
  assert.equal(c.iguales, null);
});

test('importar: el marcador de Roots se actualiza aunque el partido ya tenga lo anotado en la tablet', async () => {
  const almacen = nuevoAlmacen();
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const p11 = await almacen.uno('partidos', 11);
  M.elegirFormato(p11.est, 'mejor_de_3');
  M.guardarSet(p11.est, ctxDe([]), 25, 20);
  await almacen.guardar('partidos', p11);

  const nuevo = JSON.parse(MUESTRA);
  nuevo.idExportacion = 'exp-muestra-0009';
  nuevo.partidos = nuevo.partidos.map((p) => (p.id === 11 ? { ...p, setsGuardados: 2, setsRoots: [{ numeroSet: 1, puntosLocal: 25, puntosVisitante: 22 }, { numeroSet: 2, puntosLocal: 19, puntosVisitante: 25 }] } : p));
  const resumen = await aplicarImportacion(almacen, leerArchivoRoots(JSON.stringify(nuevo)));
  assert.equal(resumen.conservados, 1);
  const despues = await almacen.uno('partidos', 11);
  assert.equal(despues.est.sets[0].puntosVisitante, 20, 'lo anotado en la tablet no se toca');
  assert.equal(comparacionConRoots(despues).roots.texto, '25-22 · 19-25');
});
