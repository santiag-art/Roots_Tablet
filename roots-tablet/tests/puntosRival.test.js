import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import {
  ZONAS_ATAQUE, combinarResumenes, crucesOrdenados, detalleRivalActivado, frasesDelRival, guardarDetalleRivalActivado, limpiarDetalle,
  resumenContraRival, resumenPuntosRival, resumenPuntosRivalDePartido, zonaMasUsada,
} from '../js/puntosRival.js';
import { normalizarNombre } from '../js/nuevoPartido.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

const L = 'local'; // Roots
const V = 'visitante'; // rival

function partidoListo() {
  const est = estadoNuevo();
  const ctx = crearContexto();
  M.cambiarModoLibero(est, 'ninguno');
  [1, 2, 3, 4, 5, 6].forEach((id) => M.toggleJugador(est, ctx, id));
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, L);
  return { est, ctx };
}

test('limpiarDetalle: motivo válido y zonas solo en los ataques', () => {
  assert.equal(limpiarDetalle(null), null);
  assert.equal(limpiarDetalle({ motivo: 'otro' }), null);
  assert.deepEqual(limpiarDetalle({ motivo: 'saque', desde: 4, hacia: 1 }), { motivo: 'saque' });
  assert.deepEqual(limpiarDetalle({ motivo: 'ataque', desde: 4, hacia: 1 }), { motivo: 'ataque', desde: 4, hacia: 1 });
  assert.deepEqual(limpiarDetalle({ motivo: 'ataque', desde: '3', hacia: '6' }), { motivo: 'ataque', desde: 3, hacia: 6 });
  assert.deepEqual(limpiarDetalle({ motivo: 'ataque', desde: 5, hacia: 9 }), { motivo: 'ataque' }); // la 5 no sale de las zonas de ataque
  assert.deepEqual(limpiarDetalle({ motivo: 'ataque', hacia: 2 }), { motivo: 'ataque', hacia: 2 });
  assert.deepEqual(ZONAS_ATAQUE, [4, 3, 2, 6, 1]);
});

test('detallarPuntoRival guarda el detalle junto al punto sin tocar su rotación ni su saque', () => {
  const { est, ctx } = partidoListo();
  M.sumarPunto(est, ctx, V);
  const antes = structuredClone(est.actual.puntosInfo[0]);
  const detalle = M.detallarPuntoRival(est, { motivo: 'ataque', desde: 4, hacia: 5 });
  assert.deepEqual(detalle, { motivo: 'ataque', desde: 4, hacia: 5 });
  assert.deepEqual(est.actual.puntosInfo[0], { ...antes, detalle: { motivo: 'ataque', desde: 4, hacia: 5 } });
});

test('detallarPuntoRival: solo el último punto y solo si es del rival', () => {
  const { est, ctx } = partidoListo();
  assert.throws(() => M.detallarPuntoRival(est, { motivo: 'saque' }), /último punto/); // aún no hay puntos
  M.sumarPunto(est, ctx, L);
  assert.throws(() => M.detallarPuntoRival(est, { motivo: 'saque' }), /último punto/); // punto nuestro
  M.sumarPunto(est, ctx, V);
  assert.throws(() => M.detallarPuntoRival(est, { motivo: 'nada' }), /Elige cómo/);
  assert.equal(est.actual.puntosInfo[1].detalle, undefined); // el intento fallido no deja nada
  M.detallarPuntoRival(est, { motivo: 'bloqueo' });
  M.sumarPunto(est, ctx, L);
  assert.throws(() => M.detallarPuntoRival(est, { motivo: 'saque' }), /último punto/); // ya no es el último movimiento
});

test('Deshacer quita el punto con su detalle y quitar un punto del rival se lleva el suyo', () => {
  const { est, ctx } = partidoListo();
  M.sumarPunto(est, ctx, V);
  M.detallarPuntoRival(est, { motivo: 'error' });
  M.deshacerUltimaAccion(est);
  assert.deepEqual([est.actual.puntosSeq, est.actual.puntosInfo], [[], []]);
  M.sumarPunto(est, ctx, V);
  M.detallarPuntoRival(est, { motivo: 'ataque', desde: 2, hacia: 3 });
  M.sumarPunto(est, ctx, L);
  M.restarPunto(est, ctx, V); // resta de otro lado que el último movimiento: quita el punto del rival
  assert.deepEqual(est.actual.puntosSeq, [L]);
  assert.equal(est.actual.puntosInfo.length, 1);
  M.deshacerUltimaAccion(est); // deshace la resta: vuelve con su detalle
  assert.deepEqual(est.actual.puntosSeq, [V, L]);
  assert.deepEqual(est.actual.puntosInfo[0].detalle, { motivo: 'ataque', desde: 2, hacia: 3 });
});

function setCompleto(est, ctx, ataques) {
  // El rival anota los ataques indicados y nosotras llegamos a 25.
  ataques.forEach(([desde, hacia]) => {
    M.sumarPunto(est, ctx, V);
    M.detallarPuntoRival(est, { motivo: 'ataque', desde, hacia });
  });
  while (est.actual.puntosLocal < 25) M.sumarPunto(est, ctx, L);
}

test('el detalle sobrevive a guardar el set, reabrirlo y a copiar el estado (borrador o copia)', () => {
  const { est, ctx } = partidoListo();
  setCompleto(est, ctx, [[4, 1], [4, 5]]);
  M.guardarSet(est, ctx, est.actual.puntosLocal, est.actual.puntosVisitante);
  const detalles = (set) => set.puntosInfo.map((i) => i.detalle).filter(Boolean);
  assert.deepEqual(detalles(est.sets[0]), [{ motivo: 'ataque', desde: 4, hacia: 1 }, { motivo: 'ataque', desde: 4, hacia: 5 }]);
  const viaJson = M.normalizarEstado(JSON.parse(JSON.stringify(est)));
  assert.deepEqual(detalles(viaJson.sets[0]), detalles(est.sets[0]));
  M.reabrirUltimoSet(est);
  assert.deepEqual(detalles(est.actual), [{ motivo: 'ataque', desde: 4, hacia: 1 }, { motivo: 'ataque', desde: 4, hacia: 5 }]);
});

test('resumen: cuenta motivos, zonas de salida, zonas de caída y trayectorias', () => {
  const { est, ctx } = partidoListo();
  const anota = (detalle) => { M.sumarPunto(est, ctx, V); if (detalle) M.detallarPuntoRival(est, detalle); };
  anota({ motivo: 'ataque', desde: 4, hacia: 1 });
  anota({ motivo: 'ataque', desde: 4, hacia: 1 });
  anota({ motivo: 'ataque', desde: 3, hacia: 6 });
  anota({ motivo: 'ataque' }); // sin zonas
  anota({ motivo: 'saque' });
  anota({ motivo: 'error' });
  anota(null); // sin detalle
  M.sumarPunto(est, ctx, L);
  const r = resumenPuntosRivalDePartido(est);
  assert.equal(r.total, 7);
  assert.deepEqual([r.conDetalle, r.sinDetalle], [6, 1]);
  assert.deepEqual(r.motivos, { ataque: 4, saque: 1, bloqueo: 0, error: 1 });
  assert.deepEqual([r.ataques.total, r.ataques.conOrigen, r.ataques.conDestino], [4, 3, 3]);
  assert.deepEqual([r.ataques.desde[4], r.ataques.desde[3], r.ataques.desde[2]], [2, 1, 0]);
  assert.deepEqual([r.ataques.hacia[1], r.ataques.hacia[6]], [2, 1]);
  assert.deepEqual(crucesOrdenados(r), [{ desde: 4, hacia: 1, n: 2 }, { desde: 3, hacia: 6, n: 1 }]);
  assert.deepEqual(zonaMasUsada(r.ataques.desde), { zonas: [4], n: 2 });
  const frases = frasesDelRival(r, 'Halcones');
  assert.equal(frases.length, 3);
  assert.match(frases[0], /Halcones anota sobre todo por ataque \(4 de 6\)/);
  assert.match(frases[1], /desde la zona 4 \(2 de 3\)/);
  assert.match(frases[2], /cae más en la zona 1 .* \(2 de 3\)/);
  assert.deepEqual(frasesDelRival(resumenPuntosRival([], L)), []);
});

test('resumen por set y empate de zonas', () => {
  const { est, ctx } = partidoListo();
  setCompleto(est, ctx, [[4, 1]]);
  M.guardarSet(est, ctx, est.actual.puntosLocal, est.actual.puntosVisitante);
  M.sumarPunto(est, ctx, V);
  M.detallarPuntoRival(est, { motivo: 'ataque', desde: 3, hacia: 2 });
  assert.equal(resumenPuntosRivalDePartido(est, 1).ataques.desde[4], 1);
  assert.equal(resumenPuntosRivalDePartido(est, 'actual').ataques.desde[3], 1);
  const todo = resumenPuntosRivalDePartido(est, 'todo');
  assert.deepEqual(zonaMasUsada(todo.ataques.desde), { zonas: [3, 4], n: 1 });
  assert.match(frasesDelRival(todo)[1], /las zonas 3 y 4/);
});

test('contra un rival: junta los partidos aunque el nombre cambie de mayúsculas, tildes o lado', () => {
  const hecho = (nombresPartido, ladoRival, detalle) => {
    const { est, ctx } = partidoListo();
    est.ladoPropio = ladoRival === V ? L : V;
    M.elegirSaque(est, est.ladoPropio);
    M.sumarPunto(est, ctx, ladoRival);
    M.detallarPuntoRival(est, detalle);
    return { ...nombresPartido, est };
  };
  const a = hecho({ equipoLocal: 'Roots', equipoVisitante: 'Águilas FC' }, V, { motivo: 'ataque', desde: 4, hacia: 1 });
  const b = hecho({ equipoLocal: 'aguilas fc', equipoVisitante: 'Roots' }, L, { motivo: 'ataque', desde: 4, hacia: 6 });
  const c = hecho({ equipoLocal: 'Roots', equipoVisitante: 'Halcones' }, V, { motivo: 'saque' });
  const { partidos, resumen } = resumenContraRival([a, b, c], 'Águilas FC', normalizarNombre);
  assert.equal(partidos, 2);
  assert.equal(resumen.motivos.ataque, 2);
  assert.equal(resumen.ataques.desde[4], 2);
  assert.deepEqual([resumen.ataques.hacia[1], resumen.ataques.hacia[6]], [1, 1]);
  assert.equal(resumenContraRival([a, b, c], 'Nadie', normalizarNombre).partidos, 0);
  assert.equal(combinarResumenes([]).total, 0);
});

test('preferencia: viene activada y se puede apagar', () => {
  const m = new Map();
  const almacen = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.equal(detalleRivalActivado(almacen), true);
  guardarDetalleRivalActivado(false, almacen);
  assert.equal(detalleRivalActivado(almacen), false);
  guardarDetalleRivalActivado(true, almacen);
  assert.equal(detalleRivalActivado(almacen), true);
  assert.equal(detalleRivalActivado({ getItem: () => { throw new Error('x'); } }), true);
});
