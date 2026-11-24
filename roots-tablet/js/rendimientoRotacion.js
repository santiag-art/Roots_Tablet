// Rendimiento por rotación: en cuál de las 6 rotaciones del equipo se pierden más puntos o se recibe peor.
// Función pura (sin pantalla). Usa lo que el motor guarda por punto (rotación y saque) y la rotación de cada recepción.
//
// "Rotación 1" es la formación con que empieza el set; cada vez que el equipo recupera el saque pasa a la siguiente.
import { contar } from './estadisticas.js';

// Para marcar una rotación como la más débil hacen falta al menos estos datos (si no, es ruido).
export const MIN_PUNTOS = 4;
export const MIN_RECEPCIONES = 3;

const porcentaje = (a, b) => (b ? a / b : null);

function setsDelAlcance(est, alcance) {
  if (alcance === 'todo') return [...est.sets, est.actual];
  if (alcance === 'actual') return [est.actual];
  return est.sets.filter((s) => s.numeroSet === alcance);
}

export function rendimientoPorRotacion(est, alcance = 'todo') {
  const propio = est.ladoPropio;
  const filas = Array.from({ length: 6 }, (_, i) => ({ rotacion: i + 1, ganados: 0, perdidos: 0, sacando: { ganados: 0, total: 0 }, recibiendo: { ganados: 0, total: 0 }, eventos: [] }));
  let sinRotacion = 0;
  for (const set of setsDelAlcance(est, alcance)) {
    (set.puntosSeq ?? []).forEach((lado, i) => {
      const info = set.puntosInfo?.[i];
      if (info?.rot == null || !filas[info.rot]) {
        sinRotacion += 1;
        return;
      }
      const f = filas[info.rot];
      const ganamos = lado === propio;
      if (ganamos) f.ganados += 1;
      else f.perdidos += 1;
      if (info.saca != null) {
        const bloque = info.saca === propio ? f.sacando : f.recibiendo;
        bloque.total += 1;
        if (ganamos) bloque.ganados += 1;
      }
    });
    for (const e of set.eventos ?? []) {
      if (e.fundamento === 'Recepción' && Number.isInteger(e.rotacion) && filas[e.rotacion]) filas[e.rotacion].eventos.push(e);
    }
  }
  const resultado = filas.map((f) => ({
    rotacion: f.rotacion,
    ganados: f.ganados,
    perdidos: f.perdidos,
    total: f.ganados + f.perdidos,
    diferencia: f.ganados - f.perdidos,
    saque: { ...f.sacando, porcentaje: porcentaje(f.sacando.ganados, f.sacando.total) }, // puntos que ganamos con nuestro saque
    sideOut: { ...f.recibiendo, porcentaje: porcentaje(f.recibiendo.ganados, f.recibiendo.total) }, // puntos que ganamos al recibir
    recepcion: contar(f.eventos),
  }));

  const conPuntos = resultado.filter((f) => f.total >= MIN_PUNTOS);
  const masDebil = conPuntos.length >= 2 ? [...conPuntos].sort((a, b) => a.diferencia - b.diferencia || a.ganados / a.total - b.ganados / b.total)[0] : null;
  const conRecepcion = resultado.filter((f) => f.recepcion.total >= MIN_RECEPCIONES);
  const ordenadas = [...conRecepcion].sort((a, b) => a.recepcion.efectividad - b.recepcion.efectividad);
  const peorRecepcion = ordenadas.length >= 2 && ordenadas[0].recepcion.efectividad < ordenadas.at(-1).recepcion.efectividad ? ordenadas[0] : null;
  return {
    alcance,
    filas: resultado,
    sinRotacion,
    hayDatos: resultado.some((f) => f.total > 0 || f.recepcion.total > 0),
    masDebil: masDebil && masDebil.diferencia < 0 ? masDebil.rotacion : null,
    peorRecepcion: peorRecepcion ? peorRecepcion.rotacion : null,
  };
}
