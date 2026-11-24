import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { leerArchivoRoots, aplicarImportacion } from '../js/importar.js';
import { crearAlmacen, crearRespaldoMemoria } from '../js/store.js';
import {
  ErrorBorrador, aplicarBorrador, borrarEspejo, construirBorrador, guardarEspejo, leerBorrador, leerEspejo, nombreArchivoBorrador,
  partidosSinBorrador, recuperarDesdeEspejo, tieneSetEnJuego,
} from '../js/borrador.js';
import { construirResultados } from '../js/exportar.js';
import * as M from '../js/motor.js';

const MUESTRA = readFileSync(new URL('./fixtures/muestra-roots.json', import.meta.url), 'utf8');
const nuevo = () => crearAlmacen(crearRespaldoMemoria());
const ctx = (jugadores) => ({ jugadores, lesiones: new Map(), ahora: () => new Date('2026-11-22T10:00:00Z'), avisar() {} });

// localStorage de mentira
function guardaFalsa({ fallaAlEscribir = false } = {}) {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (fallaAlEscribir) throw new Error('QuotaExceededError');
      m.set(k, v);
    },
    removeItem: (k) => m.delete(k),
  };
}

// Partido con un set guardado (25-20) y otro en juego (7-5)
async function almacenConSetEnJuego() {
  const a = nuevo();
  await aplicarImportacion(a, leerArchivoRoots(MUESTRA), { nombreArchivo: 'x.json', ahora: new Date('2026-11-22T08:00:00Z') });
  const reg = await a.uno('partidos', 10);
  const jugadores = (await a.todos('jugadores')).filter((j) => j.genero === 'femenino');
  const c = ctx(jugadores);
  M.elegirFormato(reg.est, 'mejor_de_3');
  M.guardarSet(reg.est, c, 25, 20);
  reg.est.actual.puntosLocal = 7;
  reg.est.actual.puntosVisitante = 5;
  reg.est.actualizadoEn = '2026-11-22T09:00:00.000Z';
  await a.guardar('partidos', reg);
  await a.pendientes();
  return { a, reg, torneos: await a.todos('torneos'), jugadores: await a.todos('jugadores') };
}

test('el borrador lleva el set en juego, que el archivo de resultados no lleva', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  assert.ok(tieneSetEnJuego(reg));
  const resultados = construirResultados({ registros: [reg], ids: [10] });
  assert.equal(resultados.partidos[0].sets.length, 1); // solo el set cerrado
  const b = construirBorrador({ registros: [reg], torneos, jugadores, ahora: new Date('2026-11-22T10:00:00Z') });
  const leido = leerBorrador(JSON.stringify(b));
  assert.equal(leido.partidos[0].est.actual.puntosLocal, 7);
  assert.equal(leido.partidos[0].est.actual.puntosVisitante, 5);
  assert.equal(leido.partidos[0].est.sets.length, 1);
  assert.ok(leido.torneos.every((t) => t.id === reg.torneoId));
  assert.ok(leido.jugadores.length > 0);
});

test('recuperar un borrador en una tablet vacía deja el partido como estaba', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  const b = leerBorrador(JSON.stringify(construirBorrador({ registros: [reg], torneos, jugadores })));
  const destino = nuevo();
  const r = await aplicarBorrador(destino, b);
  assert.deepEqual(r, { restaurados: [10], conservados: [] });
  assert.deepEqual(await destino.uno('partidos', 10), reg);
  assert.equal((await destino.todos('torneos')).length, b.torneos.length);
  assert.equal((await destino.todos('jugadores')).length, b.jugadores.length);
});

test('un borrador viejo no pisa lo más nuevo que ya hay en la tablet', async () => {
  const { a, reg, torneos, jugadores } = await almacenConSetEnJuego();
  const b = construirBorrador({ registros: [reg], torneos, jugadores });
  const nuevoReg = structuredClone(reg);
  nuevoReg.est.actual.puntosLocal = 12;
  nuevoReg.est.actualizadoEn = '2026-11-22T09:30:00.000Z';
  await a.guardar('partidos', nuevoReg);
  const r = await aplicarBorrador(a, leerBorrador(JSON.stringify(b)));
  assert.deepEqual(r, { restaurados: [], conservados: [10] });
  assert.equal((await a.uno('partidos', 10)).est.actual.puntosLocal, 12);
});

test('un borrador más nuevo sí reemplaza el partido de la tablet', async () => {
  const { a, reg, torneos, jugadores } = await almacenConSetEnJuego();
  const masNuevo = structuredClone(reg);
  masNuevo.est.actual.puntosLocal = 15;
  masNuevo.est.actualizadoEn = '2026-11-22T09:45:00.000Z';
  const r = await aplicarBorrador(a, leerBorrador(JSON.stringify(construirBorrador({ registros: [masNuevo], torneos, jugadores }))));
  assert.deepEqual(r.restaurados, [10]);
  assert.equal((await a.uno('partidos', 10)).est.actual.puntosLocal, 15);
});

test('leerBorrador rechaza archivos que no son borradores, con mensaje claro', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  const b = construirBorrador({ registros: [reg], torneos, jugadores });
  assert.throws(() => leerBorrador('no es json'), ErrorBorrador);
  assert.throws(() => leerBorrador(JSON.stringify({ aplicacion: 'roots-tablet' })), /no es un borrador/);
  assert.throws(() => leerBorrador(JSON.stringify({ ...b, version: 9 })), /versión 9/);
  assert.throws(() => leerBorrador(JSON.stringify({ ...b, jugadores: undefined })), /jugadores/);
  assert.throws(() => leerBorrador(JSON.stringify({ ...b, partidos: [] })), /no trae partidos/);
  const danado = structuredClone(b);
  danado.partidos[0].est.actual = null;
  assert.throws(() => leerBorrador(JSON.stringify(danado)), /dañado/);
  const repetido = structuredClone(b);
  repetido.partidos.push(structuredClone(repetido.partidos[0]));
  assert.throws(() => leerBorrador(JSON.stringify(repetido)), /repetido/);
});

test('partidosSinBorrador avisa solo si hay set en juego y cambió después del último borrador', async () => {
  const { reg } = await almacenConSetEnJuego();
  assert.equal(partidosSinBorrador([reg], null).length, 1);
  assert.equal(partidosSinBorrador([reg], '2026-11-22T09:30:00.000Z').length, 0);
  assert.equal(partidosSinBorrador([reg], '2026-11-22T08:30:00.000Z').length, 1);
  const terminado = structuredClone(reg);
  terminado.est.finalizado = true;
  assert.equal(partidosSinBorrador([terminado], null).length, 0);
  const sinNada = structuredClone(reg);
  sinNada.est.actual = M.nuevoSetEnCurso();
  assert.equal(partidosSinBorrador([sinNada], null).length, 0);
});

test('el espejo guarda cada jugada y recupera lo que el almacén principal perdió', async () => {
  const { a, reg, torneos, jugadores } = await almacenConSetEnJuego();
  const ls = guardaFalsa();
  assert.equal(guardarEspejo(reg, { torneos, jugadores, ls }), true);
  assert.equal(leerEspejo(ls).partidos[0].est.actual.puntosLocal, 7);

  // El almacén principal quedó atrás (la última jugada no llegó a escribirse)
  const atrasado = structuredClone(reg);
  atrasado.est.actual.puntosLocal = 6;
  atrasado.est.actualizadoEn = '2026-11-22T08:59:00.000Z';
  await a.guardar('partidos', atrasado);
  assert.deepEqual(await recuperarDesdeEspejo(a, ls), [10]);
  assert.equal((await a.uno('partidos', 10)).est.actual.puntosLocal, 7);

  // Con todo al día no hace nada
  assert.deepEqual(await recuperarDesdeEspejo(a, ls), []);
});

test('el espejo recupera el partido con su torneo y jugadoras si el almacén quedó vacío', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  const ls = guardaFalsa();
  guardarEspejo(reg, { torneos, jugadores, ls });
  const vacio = nuevo();
  assert.deepEqual(await recuperarDesdeEspejo(vacio, ls), [10]);
  assert.ok((await vacio.todos('jugadores')).length > 0);
  assert.equal((await vacio.todos('torneos')).length, 1);
});

test('borrar un partido a propósito quita su espejo, y el de otro no se toca', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  const ls = guardaFalsa();
  guardarEspejo(reg, { torneos, jugadores, ls });
  borrarEspejo([99], ls);
  assert.ok(leerEspejo(ls));
  borrarEspejo([10], ls);
  assert.equal(leerEspejo(ls), null);
  guardarEspejo(reg, { torneos, jugadores, ls });
  borrarEspejo(null, ls); // vaciar todo
  assert.equal(leerEspejo(ls), null);
});

test('el espejo nunca rompe la app: sin espacio, sin localStorage o con basura dentro', async () => {
  const { reg, torneos, jugadores } = await almacenConSetEnJuego();
  assert.equal(guardarEspejo(reg, { torneos, jugadores, ls: guardaFalsa({ fallaAlEscribir: true }) }), false);
  assert.equal(guardarEspejo(reg, { torneos, jugadores, ls: null }), false);
  const sucia = guardaFalsa();
  sucia.setItem('roots-espejo', '{esto no es json');
  assert.equal(leerEspejo(sucia), null);
  assert.deepEqual(await recuperarDesdeEspejo(nuevo(), sucia), []);
  // un partido sin nada anotado no se espeja
  const vacio = { ...reg, est: M.nuevoEstadoPartido(reg) };
  const ls = guardaFalsa();
  assert.equal(guardarEspejo(vacio, { torneos, jugadores, ls }), false);
});

test('el nombre del archivo del borrador lleva fecha y hora', () => {
  assert.equal(nombreArchivoBorrador(new Date(2026, 10, 22, 9, 5)), 'roots-borrador-2026-11-22-0905.json');
});
