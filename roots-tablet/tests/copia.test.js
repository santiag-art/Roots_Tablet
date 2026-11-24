import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerArchivoRoots, aplicarImportacion } from '../js/importar.js';
import { crearAlmacen, crearRespaldoMemoria } from '../js/store.js';
import { construirCopia, contarCopia, leerCopia, restaurarCopia, marcarCopiaHecha, partidosSinCopia, nombreArchivoCopia, ErrorCopia } from '../js/copia.js';
import * as M from '../js/motor.js';

const MUESTRA = readFileSync(new URL('./fixtures/muestra-roots.json', import.meta.url), 'utf8');
const nuevo = () => crearAlmacen(crearRespaldoMemoria());
const ctx = (jugadores) => ({ jugadores, lesiones: new Map(), ahora: () => new Date('2026-11-22T10:00:00Z'), avisar() {} });

async function almacenConPartidoJugado() {
  const a = nuevo();
  await aplicarImportacion(a, leerArchivoRoots(MUESTRA), { nombreArchivo: 'x.json', ahora: new Date('2026-11-22T08:00:00Z') });
  const reg = await a.uno('partidos', 10);
  const jugadores = await a.todos('jugadores');
  const c = ctx(jugadores.filter((j) => j.genero === 'femenino'));
  M.elegirFormato(reg.est, 'mejor_de_3');
  M.guardarSet(reg.est, c, 25, 20);
  reg.est.actualizadoEn = '2026-11-22T09:00:00.000Z';
  await a.guardar('partidos', reg);
  await a.pendientes();
  return a;
}

test('una copia restaurada en otra tablet deja exactamente lo mismo', async () => {
  const origen = await almacenConPartidoJugado();
  const copia = await construirCopia(origen, { ahora: new Date('2026-11-22T12:00:00Z'), versionApp: '1.2.0' });
  const texto = JSON.stringify(copia);
  const leida = leerCopia(texto);
  assert.deepEqual(contarCopia(leida), { partidos: 3, partidosConSets: 1, jugadores: 26, torneos: 2 });

  const destino = nuevo();
  await destino.guardar('partidos', { id: 999, est: { sets: [], actual: { slots: [], eventos: [] } } }); // algo previo que debe desaparecer
  await restaurarCopia(destino, leida);
  for (const t of ['torneos', 'jugadores', 'lesiones', 'partidos', 'importaciones']) {
    const a = (await origen.todos(t)).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    const b = (await destino.todos(t)).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)));
    assert.deepEqual(b, a, t);
  }
  assert.ok(!(await destino.uno('partidos', 999)));
  assert.equal((await destino.uno('meta', 'ultimaCopia')).fecha, '2026-11-22T12:00:00.000Z');
});

test('leerCopia explica por qué rechaza cada archivo', async () => {
  const buena = JSON.parse(JSON.stringify(await construirCopia(await almacenConPartidoJugado())));
  assert.throws(() => leerCopia('no es json'), ErrorCopia);
  assert.throws(() => leerCopia(JSON.stringify({ aplicacion: 'roots-tablet', version: 1 })), /Importar archivo/);
  assert.throws(() => leerCopia(JSON.stringify({ aplicacion: 'roots-tablet-resultados' })), /resultados para Roots/);
  assert.throws(() => leerCopia(JSON.stringify({ aplicacion: 'otra' })), /no es una copia/);
  assert.throws(() => leerCopia(JSON.stringify({ ...buena, version: 7 })), /versión 7/);
  const sinTabla = JSON.parse(JSON.stringify(buena)); delete sinTabla.tablas.partidos;
  assert.throws(() => leerCopia(JSON.stringify(sinTabla)), /falta la tabla "partidos"/);
  const rota = JSON.parse(JSON.stringify(buena)); delete rota.tablas.partidos[0].est.actual;
  assert.throws(() => leerCopia(JSON.stringify(rota)), /está dañado/);
  const repetida = JSON.parse(JSON.stringify(buena)); repetida.tablas.partidos.push(repetida.tablas.partidos[0]);
  assert.throws(() => leerCopia(JSON.stringify(repetida)), /repetido/);
  const sinId = JSON.parse(JSON.stringify(buena)); delete sinId.tablas.jugadores[0].id;
  assert.throws(() => leerCopia(JSON.stringify(sinId)), /filas dañadas/);
  assert.ok(leerCopia(JSON.stringify(buena)));
});

test('partidosSinCopia avisa solo de lo anotado que cambió después de la última copia', async () => {
  const a = await almacenConPartidoJugado();
  const partidos = await a.todos('partidos');
  assert.deepEqual(partidosSinCopia(partidos, null).map((p) => p.id), [10], 'sin copia previa: el que tiene sets');
  assert.deepEqual(partidosSinCopia(partidos, '2026-11-22T10:00:00.000Z'), [], 'copia posterior al último cambio');
  assert.deepEqual(partidosSinCopia(partidos, '2026-11-22T08:30:00.000Z').map((p) => p.id), [10], 'cambió después de la copia');
  await marcarCopiaHecha(a, new Date('2026-11-22T10:00:00Z'));
  assert.equal((await a.uno('meta', 'ultimaCopia')).fecha, '2026-11-22T10:00:00.000Z');
});

test('nombre del archivo de copia', () => {
  assert.equal(nombreArchivoCopia(new Date(2026, 10, 23, 5, 7)), 'roots-tablet-copia-2026-11-23-0507.json');
});
