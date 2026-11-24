// Estadísticas de un partido a partir de las jugadas anotadas. Función pura: no toca la pantalla ni el almacenamiento.
//
// Alcance: 'todo' (el partido completo), un número de set cerrado (1, 2, ...) o 'actual' (el set en juego).
import { FUNDAMENTOS } from './reglas/anotacion.js';
import { ORDEN_POSICIONES, NOMBRES_POSICION, clavePosicion } from './reglas/fundamentosPosicion.js';

export const CALIFICACIONES_CLAVE = ['doble_positivo', 'positivo', 'negativo', 'error'];

// Conteo de calificaciones. `efectividad` = (doble positivo + positivo) / total, o null si no hay jugadas.
export function contar(eventos) {
  const r = { total: eventos.length, doble_positivo: 0, positivo: 0, negativo: 0, error: 0 };
  for (const e of eventos) if (e.calificacion in r) r[e.calificacion] += 1;
  r.efectividad = r.total ? (r.doble_positivo + r.positivo) / r.total : null;
  return r;
}

export function eventosDelAlcance(est, alcance = 'todo') {
  if (alcance === 'todo') return [...est.sets.flatMap((s) => s.eventos), ...est.actual.eventos];
  if (alcance === 'actual') return [...est.actual.eventos];
  return [...(est.sets.find((s) => s.numeroSet === alcance)?.eventos ?? [])];
}

export function desglosePorFundamento(eventos) {
  return FUNDAMENTOS.map((fundamento) => ({ fundamento, ...contar(eventos.filter((e) => e.fundamento === fundamento)) }));
}

// Quién jugó de líbero en algún set (la ficha puede decir otra posición).
function idsLiberos(est) {
  const filas = [...est.sets.flatMap((s) => s.titulares), ...est.actual.titulares];
  return new Set(filas.filter((t) => t.esLibero).map((t) => t.jugadorId));
}

export function grupoDeJugadora(jugador, esLibero) {
  if (esLibero) return 'libero';
  return clavePosicion(jugador?.posicion) ?? 'otros';
}

export function nombreDeGrupo(clave) {
  return NOMBRES_POSICION[clave] ?? 'Otras';
}

function jugadorasDe(est, eventos, jugadoresPorId) {
  const liberos = idsLiberos(est);
  const ids = [...new Set(eventos.map((e) => e.jugadorId))];
  const orden = [...ORDEN_POSICIONES, 'otros'];
  return ids
    .map((id) => {
      const j = jugadoresPorId.get(id);
      const propios = eventos.filter((e) => e.jugadorId === id);
      return { id, nombre: j?.nombre ?? 'jugadora sin registrar', numero: j?.numero ?? null, grupo: grupoDeJugadora(j, liberos.has(id)), ...contar(propios), fundamentos: desglosePorFundamento(propios).filter((f) => f.total > 0) };
    })
    .sort((a, b) => orden.indexOf(a.grupo) - orden.indexOf(b.grupo) || (a.numero ?? 999) - (b.numero ?? 999) || a.nombre.localeCompare(b.nombre));
}

// Un renglón por set (cerrados y, si tiene datos, el que está en juego): marcador, tiempos muertos y cambios.
export function setsDelPartido(est) {
  const cambios = (lista) => lista.filter((x) => !x.porLibero && !x.nuevoLibero).length;
  const cerrados = est.sets.map((s) => ({
    clave: s.numeroSet,
    numeroSet: s.numeroSet,
    enJuego: false,
    puntosLocal: s.puntosLocal,
    puntosVisitante: s.puntosVisitante,
    tiemposMuertos: s.tiemposMuertos ?? { local: 0, visitante: 0 },
    cambios: cambios(s.sustituciones),
    jugadas: s.eventos.length,
  }));
  const a = est.actual;
  const hayDatos = a.puntosLocal + a.puntosVisitante > 0 || a.eventos.length > 0;
  return hayDatos
    ? [...cerrados, { clave: 'actual', numeroSet: est.sets.length + 1, enJuego: true, puntosLocal: a.puntosLocal, puntosVisitante: a.puntosVisitante, tiemposMuertos: { ...a.tiemposMuertos }, cambios: cambios(a.sustituciones), jugadas: a.eventos.length }]
    : cerrados;
}

export function resumenDePartido(est, jugadoresPorId, alcance = 'todo') {
  const eventos = eventosDelAlcance(est, alcance);
  return {
    alcance,
    equipo: contar(eventos),
    fundamentos: desglosePorFundamento(eventos),
    jugadoras: jugadorasDe(est, eventos, jugadoresPorId),
    sets: setsDelPartido(est),
  };
}

export function porcentaje(valor) {
  return valor == null ? '–' : `${Math.round(valor * 100)}%`;
}
