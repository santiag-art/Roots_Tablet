import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/motor.js';
import { datosDeRegistro, construirPdfDeJpeg, nombreBaseResumen, dibujarResumen } from '../js/resumenCompartir.js';
import { crearContexto, JUGADORAS } from './ayuda.js';

const TORNEO = { id: 1, nombre: 'Copa Roots', genero: 'femenino', categoria: 'menores' };

function partidoJugado({ ladoPropio = 'local' } = {}) {
  const est = m.nuevoEstadoPartido({ id: 1, equipoLocal: 'Roots', equipoVisitante: 'Rivales' });
  est.ladoPropio = ladoPropio;
  m.elegirFormato(est, 'mejor_de_3');
  const ctx = crearContexto();
  [1, 2, 3, 4, 5, 6].forEach((id) => m.toggleJugador(est, ctx, id));
  m.confirmarPlantilla(est, ctx);
  m.elegirSaque(est, 'local');
  // Bea (2): 3 positivas y 1 error en ataque; Ana (1): 1 sola acción (no alcanza el mínimo)
  ['positivo', 'doble_positivo', 'positivo', 'error'].forEach((c) => m.registrarJugada(est, ctx, 2, 'Ataque', c));
  m.registrarJugada(est, ctx, 1, 'Saque', 'positivo');
  m.guardarSet(est, ctx, 25, 20);
  return { registro: { id: 1, torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'Rivales', fecha: '2026-11-22', hora: '09:00', est }, est, ctx };
}

test('el resumen toma marcador, rival y mejores jugadoras como Roots', () => {
  const { registro } = partidoJugado();
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  assert.equal(d.equipo, 'Roots');
  assert.equal(d.rival, 'Rivales');
  assert.equal(d.gano, true);
  assert.deepEqual([d.setsRoots, d.setsRival], [1, 0]);
  assert.deepEqual(d.sets, [{ roots: 25, rival: 20, tmRoots: 0, tmRival: 0 }]);
  assert.equal(d.hayTiemposMuertos, false); // nadie pidió tiempo muerto: no se muestra
  assert.equal(d.subtitulo, 'Femenino · Menores');
  assert.equal(d.tituloDestacadas, 'Mejores jugadoras');
  assert.deepEqual(d.destacadas.map((x) => x.nombre), ['Bea Punta']);
  assert.equal(d.destacadas[0].positivas, 3);
  assert.equal(d.hayJugadas, true);
  assert.ok(d.claves.some((c) => /Set único 25-20/.test(c)));
});

test('si Roots es el visitante, los puntos se leen del lado correcto', () => {
  const { registro } = partidoJugado({ ladoPropio: 'visitante' });
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  assert.equal(d.equipo, 'Rivales');
  assert.equal(d.rival, 'Roots');
  assert.deepEqual(d.sets, [{ roots: 20, rival: 25, tmRoots: 0, tmRival: 0 }]);
  assert.equal(d.gano, false);
});

test('las jugadas del set que sigue sin guardar no entran al resumen', () => {
  const { registro, est, ctx } = partidoJugado();
  m.elegirSaque(est, 'local');
  m.registrarJugada(est, ctx, 3, 'Ataque', 'doble_positivo');
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  assert.equal(d.destacadas.some((x) => x.nombre.startsWith('Cami')), false);
});

test('el PDF tiene la estructura correcta y su tabla de posiciones apunta a cada objeto', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = construirPdfDeJpeg(jpeg, 1080, 1500);
  const texto = Buffer.from(pdf).toString('latin1');
  assert.ok(texto.startsWith('%PDF-1.4'));
  assert.ok(texto.trimEnd().endsWith('%%EOF'));
  const inicioXref = Number(/startxref\n(\d+)/.exec(texto)[1]);
  assert.ok(texto.slice(inicioXref).startsWith('xref'));
  const posiciones = [...texto.slice(inicioXref).matchAll(/(\d{10}) 00000 n /g)].map((x) => Number(x[1]));
  assert.equal(posiciones.length, 5);
  posiciones.forEach((pos, i) => assert.ok(texto.slice(pos).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1} en su posición`));
  assert.ok(texto.includes('/Length 9'), 'el largo de la imagen es el del JPEG');
  assert.ok(texto.includes('/MediaBox [0 0 425.2 590.55]'));
});

test('nombre de archivo del resumen', () => {
  const { registro } = partidoJugado();
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  assert.equal(nombreBaseResumen(registro, d), 'resumen-roots-vs-rivales-2026-11-22');
});

test('dibujarResumen corre completo con un lienzo de mentira', () => {
  const { registro } = partidoJugado();
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  const crear = (w, h) => ({
    width: w,
    height: h,
    getContext: () => new Proxy({ measureText: (t) => ({ width: String(t).length * 10 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true }),
  });
  const lienzo = dibujarResumen(d, null, crear);
  assert.equal(lienzo.width, 1080);
  assert.ok(lienzo.height > 600 && lienzo.height < 2600);
});

test('los tiempos muertos pedidos salen en el resumen, del lado de Roots', () => {
  const { registro, est } = partidoJugado({ ladoPropio: 'visitante' });
  est.sets[0].tiemposMuertos = { local: 2, visitante: 1 }; // Roots es visitante: pidió 1, el rival pidió 2
  const d = datosDeRegistro({ registro, torneo: TORNEO, jugadores: JUGADORAS });
  assert.equal(d.hayTiemposMuertos, true);
  assert.deepEqual([d.tiemposRoots, d.tiemposRival], [1, 2]);
  assert.deepEqual([d.sets[0].tmRoots, d.sets[0].tmRival], [1, 2]);
  const crear = (w, h) => ({
    width: w,
    height: h,
    getContext: () => new Proxy({ measureText: (t) => ({ width: String(t).length * 10 }) }, { get: (o, k) => (k in o ? o[k] : () => {}), set: () => true }),
  });
  assert.equal(dibujarResumen(d, null, crear).width, 1080);
});
