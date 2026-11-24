import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASE_ID_TABLET, ErrorNuevoPartido, crearPartidoEnTablet, hoyYAhora, nuevoIdTablet, normalizarNombre, rivalExacto, rivalesConocidos, rivalesExistentes, rivalesParecidos, sugerirRivales } from '../js/nuevoPartido.js';
import { aplicarImportacion, leerArchivoRoots, tieneProgreso } from '../js/importar.js';
import { construirResultados } from '../js/exportar.js';
import { crearAlmacen, crearRespaldoMemoria } from '../js/store.js';
import { estadoDePartido } from '../js/resumen.js';
import * as M from '../js/motor.js';
import { crearContexto } from './ayuda.js';

const MUESTRA = readFileSync(new URL('./fixtures/muestra-roots.json', import.meta.url), 'utf8');
const TORNEO = { id: 1, nombre: 'Copa Pereira Femenina', genero: 'femenino', categoria: 'libre' };
const AHORA = new Date('2026-11-23T15:40:00-05:00');
const datos = (extra = {}) => ({ torneo: TORNEO, rival: 'Tigres', rootsDeLocal: true, fecha: '2026-11-23', hora: '15:40', ...extra });

test('crea un partido de la tablet listo para anotar', () => {
  const r = crearPartidoEnTablet(datos(), [], AHORA);
  assert.equal(r.creadoEnTablet, true);
  assert.ok(r.id >= BASE_ID_TABLET);
  assert.ok(r.idTablet.length > 8);
  assert.equal(r.equipoLocal, 'Roots');
  assert.equal(r.equipoVisitante, 'Tigres');
  assert.equal(r.hora, '15:40:00');
  assert.equal(r.torneoId, 1);
  assert.equal(r.est.ladoPropio, 'local');
  assert.equal(r.est.formatoSets, null);
  assert.equal(estadoDePartido(r), 'pendiente');
});

test('si Roots es visitante, la tablet lo reconoce como el equipo propio', () => {
  const r = crearPartidoEnTablet(datos({ rootsDeLocal: false }), [], AHORA);
  assert.equal(r.equipoLocal, 'Tigres');
  assert.equal(r.equipoVisitante, 'Roots');
  assert.equal(r.est.ladoPropio, 'visitante');
});

test('valida torneo, rival, fecha y hora con mensajes claros', () => {
  const falla = (extra, patron) => assert.throws(() => crearPartidoEnTablet(datos(extra), [], AHORA), (e) => e instanceof ErrorNuevoPartido && patron.test(e.message));
  falla({ torneo: null }, /torneo/);
  falla({ rival: '   ' }, /rival/);
  falla({ rival: 'Roots Sub-15' }, /Roots/);
  falla({ rival: 'x'.repeat(41) }, /largo/);
  falla({ fecha: '23/11/2026' }, /fecha/);
  falla({ fecha: '2026-13-45' }, /fecha/);
  falla({ hora: '25:00' }, /hora/);
  falla({ hora: '' }, /hora/);
  assert.equal(crearPartidoEnTablet(datos({ rival: '  Las   Águilas  ' }), [], AHORA).equipoVisitante, 'Las Águilas', 'limpia espacios');
});

test('el id nunca se repite con uno de la tablet ni se acerca a los de Roots', () => {
  const primero = crearPartidoEnTablet(datos(), [], AHORA);
  const segundo = crearPartidoEnTablet(datos({ rival: 'Otro' }), [primero], AHORA); // mismo instante
  assert.notEqual(primero.id, segundo.id);
  assert.notEqual(primero.idTablet, segundo.idTablet);
  assert.ok(nuevoIdTablet([{ id: 10 }, { id: 99_999 }], AHORA) >= BASE_ID_TABLET);
});

test('rivales conocidos: los del torneo, sin Roots ni repetidos', () => {
  const partidos = [
    { torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'Águilas' },
    { torneoId: 1, equipoLocal: 'águilas ', equipoVisitante: 'Roots' },
    { torneoId: 1, equipoLocal: 'Cóndores', equipoVisitante: 'ROOTS' },
    { torneoId: 2, equipoLocal: 'Roots', equipoVisitante: 'Halcones' },
  ];
  assert.deepEqual(rivalesConocidos(partidos, 1), ['Águilas', 'Cóndores']);
  assert.deepEqual(rivalesConocidos(partidos, 3), []);
});

test('hoyYAhora da fecha y hora con ceros', () => {
  assert.deepEqual(hoyYAhora(new Date(2026, 0, 5, 7, 3)), { fecha: '2026-01-05', hora: '07:03' });
});

test('el partido creado viaja en los resultados marcado para que Roots lo cree', () => {
  const r = crearPartidoEnTablet(datos(), [], AHORA);
  const ctx = crearContexto();
  M.elegirFormato(r.est, 'mejor_de_3');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(r.est, ctx, id));
  M.confirmarPlantilla(r.est, ctx);
  M.guardarSet(r.est, ctx, 25, 18);
  const salida = construirResultados({ registros: [r], ids: [r.id], ahora: AHORA });
  const p = salida.partidos[0];
  assert.equal(p.creadoEnTablet, true);
  assert.equal(p.idTablet, r.idTablet);
  assert.equal(p.torneoId, 1);
  assert.equal(p.equipoVisitante, 'Tigres');
  assert.equal(p.sets.length, 1);
});

test('un partido de Roots no lleva la marca de creado en la tablet', async () => {
  const almacen = crearAlmacen(crearRespaldoMemoria());
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const importado = (await almacen.todos('partidos')).find((p) => p.id === 10);
  M.elegirFormato(importado.est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(importado.est, ctx, id));
  M.confirmarPlantilla(importado.est, ctx);
  M.guardarSet(importado.est, ctx, 25, 10);
  const p = construirResultados({ registros: [importado], ids: [10] }).partidos[0];
  assert.equal('creadoEnTablet' in p, false);
  assert.equal('idTablet' in p, false);
});

test('importar de nuevo desde Roots no toca los partidos creados en la tablet', async () => {
  const almacen = crearAlmacen(crearRespaldoMemoria());
  await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const propio = crearPartidoEnTablet(datos(), await almacen.todos('partidos'), AHORA);
  propio.est.actual.puntosLocal = 7; // ya tiene algo anotado
  await almacen.guardar('partidos', propio);
  assert.equal(tieneProgreso(propio), true);
  const resumen = await aplicarImportacion(almacen, leerArchivoRoots(MUESTRA));
  const todos = await almacen.todos('partidos');
  assert.equal(todos.length, 4);
  assert.equal(resumen.nuevos, 0);
  const sigue = todos.find((p) => p.id === propio.id);
  assert.equal(sigue.creadoEnTablet, true);
  assert.equal(sigue.est.actual.puntosLocal, 7);
  assert.equal(sigue.equipoVisitante, 'Tigres');
});

// ───────────── rivales que ya existen ─────────────

const PARTIDOS_RIVALES = [
  { torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'Halcones VC' },
  { torneoId: 1, equipoLocal: 'Titanes', equipoVisitante: 'Roots' },
  { torneoId: 2, equipoLocal: 'Roots', equipoVisitante: 'Águilas' },
  { torneoId: 2, equipoLocal: 'halcones vc', equipoVisitante: 'ROOTS' },
];

test('normalizar: sin tildes, mayúsculas, signos ni espacios de más', () => {
  assert.equal(normalizarNombre('  Águilas   F.C. '), 'aguilas f c');
  assert.equal(normalizarNombre(null), '');
});

test('rivales existentes: de todos los torneos, sin Roots ni repetidos', () => {
  const r = rivalesExistentes(PARTIDOS_RIVALES);
  assert.deepEqual(r.map((x) => x.nombre), ['Águilas', 'Halcones VC', 'Titanes']);
  assert.deepEqual([...r.find((x) => x.nombre === 'Halcones VC').torneoIds].sort(), [1, 2]);
});

test('rival exacto: reconoce el mismo equipo escrito distinto y devuelve el nombre ya guardado', () => {
  assert.equal(rivalExacto('HALCONES vc', PARTIDOS_RIVALES), 'Halcones VC');
  assert.equal(rivalExacto('aguilas', PARTIDOS_RIVALES), 'Águilas');
  assert.equal(rivalExacto('Halcones', PARTIDOS_RIVALES), null);
  assert.equal(rivalExacto('', PARTIDOS_RIVALES), null);
});

test('rivales parecidos: "Halcones" avisa de "Halcones VC", pero un equipo distinto no', () => {
  assert.deepEqual(rivalesParecidos('Halcones', PARTIDOS_RIVALES), ['Halcones VC']);
  assert.deepEqual(rivalesParecidos('Titán', PARTIDOS_RIVALES), ['Titanes'], 'singular y plural');
  assert.deepEqual(rivalesParecidos('Titane', PARTIDOS_RIVALES), ['Titanes']);
  assert.deepEqual(rivalesParecidos('Aguila', PARTIDOS_RIVALES), ['Águilas']);
  assert.deepEqual(rivalesParecidos('Tigres', PARTIDOS_RIVALES), []);
  assert.deepEqual(rivalesParecidos('Halcones VC', PARTIDOS_RIVALES), [], 'si es igual no es "parecido"');
});

test('sugerir: sin texto van los del torneo; escribiendo, los de todos los torneos que coinciden', () => {
  assert.deepEqual(sugerirRivales('', PARTIDOS_RIVALES, 1), ['Halcones VC', 'Titanes']);
  assert.deepEqual(sugerirRivales('', PARTIDOS_RIVALES, 3), ['Águilas', 'Halcones VC', 'Titanes'], 'torneo sin rivales: se ofrecen todos');
  assert.deepEqual(sugerirRivales('hal', PARTIDOS_RIVALES, 2), ['Halcones VC']);
  assert.deepEqual(sugerirRivales('Titanes', PARTIDOS_RIVALES, 2), ['Titanes'], 'aunque sea de otro torneo');
  assert.deepEqual(sugerirRivales('zzz', PARTIDOS_RIVALES, 1), []);
  assert.equal(sugerirRivales('', PARTIDOS_RIVALES, 1, 1).length, 1, 'respeta el máximo');
});

test('crear partido: si el rival ya existe con otra escritura, usa el nombre guardado', () => {
  const r = crearPartidoEnTablet(datos({ rival: 'halcones vc' }), PARTIDOS_RIVALES, AHORA);
  assert.equal(r.equipoVisitante, 'Halcones VC');
  const otro = crearPartidoEnTablet(datos({ rival: 'Halcones', rootsDeLocal: false }), PARTIDOS_RIVALES, AHORA);
  assert.equal(otro.equipoLocal, 'Halcones', 'un nombre solo parecido se respeta tal cual (la pantalla ya preguntó)');
});
