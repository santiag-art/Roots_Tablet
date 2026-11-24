import test from 'node:test';
import assert from 'node:assert/strict';
import * as M from '../js/motor.js';
import { resultadoDelPartido, rivalPorClave, rivalesConHistorial, setsDelPartido } from '../js/historialRival.js';
import { normalizarNombre } from '../js/nuevoPartido.js';
import { crearContexto, estadoNuevo } from './ayuda.js';

const L = 'local';
const V = 'visitante';

// Partido con sets ya guardados: cada [propios, rival] es un set; `detalles` son ataques del rival en el primer set.
function partido({ id, local, visitante, fecha, ladoPropio = L, sets = [[25, 20]], detalles = [] }) {
  const est = estadoNuevo({ id, equipoLocal: local, equipoVisitante: visitante });
  const ctx = crearContexto();
  est.ladoPropio = ladoPropio;
  M.cambiarModoLibero(est, 'ninguno');
  [1, 2, 3, 4, 5, 6].forEach((j) => M.toggleJugador(est, ctx, j));
  M.confirmarPlantilla(est, ctx);
  M.elegirSaque(est, ladoPropio);
  const rival = ladoPropio === L ? V : L;
  detalles.forEach((d) => { M.sumarPunto(est, ctx, rival); M.detallarPuntoRival(est, d); });
  est.sets = sets.map(([propios, otro], i) => ({
    numeroSet: i + 1,
    puntosLocal: ladoPropio === L ? propios : otro,
    puntosVisitante: ladoPropio === L ? otro : propios,
    titulares: [], sustituciones: [], eventos: [], puntosSeq: i === 0 ? [...est.actual.puntosSeq] : [], puntosInfo: i === 0 ? [...est.actual.puntosInfo] : [],
  }));
  est.actual = M.nuevoSetEnCurso();
  return { id, torneoId: 1, equipoLocal: local, equipoVisitante: visitante, fecha, hora: '09:00:00', est };
}

test('sets ganados y perdidos desde nuestro lado, sea local o visitante', () => {
  assert.deepEqual(setsDelPartido(partido({ id: 1, local: 'Roots', visitante: 'A', fecha: '2026-01-01', sets: [[25, 20], [20, 25], [25, 22]] }).est), { ganados: 2, perdidos: 1 });
  assert.deepEqual(setsDelPartido(partido({ id: 2, local: 'A', visitante: 'Roots', ladoPropio: V, fecha: '2026-01-01', sets: [[25, 20], [25, 10]] }).est), { ganados: 2, perdidos: 0 });
  assert.equal(resultadoDelPartido(partido({ id: 3, local: 'Roots', visitante: 'A', fecha: '2026-01-01', sets: [[20, 25], [18, 25]] }).est), 'perdido');
  assert.equal(resultadoDelPartido(partido({ id: 4, local: 'Roots', visitante: 'A', fecha: '2026-01-01', sets: [] }).est), null);
});

test('agrupa por rival sin importar tildes, mayúsculas ni de qué lado jugó, con el récord y el detalle junto', () => {
  const regs = [
    partido({ id: 1, local: 'Roots', visitante: 'Águilas FC', fecha: '2026-03-01', sets: [[25, 20], [25, 18]], detalles: [{ motivo: 'ataque', desde: 4, hacia: 1 }, { motivo: 'saque' }] }),
    partido({ id: 2, local: 'aguilas fc', visitante: 'Roots', ladoPropio: V, fecha: '2026-04-01', sets: [[20, 25], [18, 25]], detalles: [{ motivo: 'ataque', desde: 4, hacia: 6 }] }),
    partido({ id: 3, local: 'Roots', visitante: 'Halcones', fecha: '2026-02-01', detalles: [{ motivo: 'error' }] }),
  ];
  const rivales = rivalesConHistorial(regs, normalizarNombre);
  assert.deepEqual(rivales.map((r) => r.nombre), ['aguilas fc', 'Halcones']); // el más jugado primero y el nombre del partido más reciente
  const aguilas = rivales[0];
  assert.deepEqual(aguilas.partidos.map((p) => p.id), [2, 1]); // más reciente primero
  assert.deepEqual([aguilas.ganados, aguilas.perdidos, aguilas.empatados], [1, 1, 0]);
  assert.equal(aguilas.resumen.total, 3);
  assert.equal(aguilas.resumen.ataques.desde[4], 2);
  assert.equal(rivalPorClave(regs, normalizarNombre('Águilas FC'), normalizarNombre)?.partidos.length, 2);
  assert.equal(rivalPorClave(regs, 'nadie', normalizarNombre), null);
});
