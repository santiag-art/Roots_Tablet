// En voleibol no existen los empates: cada set se juega hasta que un equipo
// saca al menos 2 puntos de ventaja (a 25, o a 15 en el set decisivo), y el
// partido lo gana quien se lleva la mayoría de sets — al mejor de 5 en
// categorías libres/mayores, o al mejor de 3 en categorías formativas
// (mini, infantil). Por eso un equipo siempre termina "ganando" o
// "perdiendo" el partido, nunca en empate.

// Cuenta cuántos sets ganó cada equipo a partir del marcador de cada set.
export function contarSetsGanados(sets) {
  return (sets ?? []).reduce(
    (acc, set) => {
      if (set.local > set.visitante) acc.local += 1;
      else if (set.visitante > set.local) acc.visitante += 1;
      return acc;
    },
    { local: 0, visitante: 0 }
  );
}

// "3-1", el marcador global del partido en sets.
export function formatearMarcador(sets) {
  if (!sets || sets.length === 0) return null;
  const { local, visitante } = contarSetsGanados(sets);
  return `${local}-${visitante}`;
}

// ["25-20", "22-25", "25-18", "25-23"], el detalle set por set.
export function formatearSets(sets) {
  return (sets ?? []).map((s) => `${s.local}-${s.visitante}`);
}

// "ganado" | "perdido" | null (null si el partido no ha terminado, no tiene
// sets registrados, o el equipo indicado no jugó ese partido).
export function resultadoEquipo(partido, estadoPartido, nombreEquipo) {
  if (estadoPartido !== 'finalizado' || !partido.sets || partido.sets.length === 0) return null;

  const esLocal = partido.equipoLocal === nombreEquipo;
  const esVisitante = partido.equipoVisitante === nombreEquipo;
  if (!esLocal && !esVisitante) return null;

  const { local, visitante } = contarSetsGanados(partido.sets);
  const misSets = esLocal ? local : visitante;
  const susSets = esLocal ? visitante : local;
  return misSets > susSets ? 'ganado' : 'perdido';
}

// Regla 18.2.2 (FIVB 2025-2028): en el set decisivo, cuando un equipo llega a 8 puntos los equipos cambian de cancha
// sin demora y los jugadores conservan sus posiciones. Los demás sets no tienen cambio de cancha.
export const PUNTOS_CAMBIO_CANCHA = 8;

export function requiereCambioDeCancha({ numeroSet, totalSets, puntosLocal, puntosVisitante }) {
  return numeroSet === totalSets && Math.max(puntosLocal, puntosVisitante) >= PUNTOS_CAMBIO_CANCHA;
}
