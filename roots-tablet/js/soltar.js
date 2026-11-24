// Qué significa soltar a una jugadora sobre un destino de la pantalla "Plantilla".
// Función pura (sin pantalla): devuelve QUÉ hacer y la pantalla lo ejecuta con el motor, así se puede probar sola.
//
// Destinos: "slot-0".."slot-5" (casillas P1..P6), "libero-<clave>" (cupo de líbero) y "banca".
//   - Armando la plantilla: poner en esa casilla (si estaba ocupada, se cambian de lugar), poner de líbero, o devolver a la banca.
//   - Con la plantilla confirmada: sobre una casilla es un cambio (o la entrada de un líbero que está fuera); lo demás no aplica.
// Resultado: null (no pasa nada) | { tipo: 'colocar', jugadorId, indice } | { tipo: 'libero', jugadorId, clave } | { tipo: 'banca', jugadorId }
//          | { tipo: 'entrarLibero', liberoId, saleId } | { tipo: 'cambio', saleId, entraId } | { tipo: 'aviso', texto }
export function interpretarSoltar({ confirmada, d, slots, jugadorId, destino }) {
  if (!destino || jugadorId == null) return null;

  if (!confirmada) {
    if (destino.startsWith('slot-')) {
      const indice = Number(destino.slice(5));
      if (!Number.isInteger(indice) || indice < 0 || indice > 5 || slots[indice] === jugadorId) return null;
      return { tipo: 'colocar', jugadorId, indice };
    }
    if (destino.startsWith('libero-')) {
      const clave = destino.slice(7);
      return d.tiposLibero.includes(clave) ? { tipo: 'libero', jugadorId, clave } : null;
    }
    if (destino === 'banca') return { tipo: 'banca', jugadorId };
    return null;
  }

  if (!destino.startsWith('slot-')) return null;
  const indice = Number(destino.slice(5));
  const saleId = slots[indice];
  if (saleId == null || saleId === jugadorId) return null;
  if (d.esLiberoId(jugadorId)) return { tipo: 'entrarLibero', liberoId: jugadorId, saleId };
  if (slots.includes(jugadorId)) return null; // ya está en cancha: no se cambia de lugar con el partido en juego
  if (d.reemplazadosIds.has(jugadorId)) return { tipo: 'aviso', texto: `${d.nombre(jugadorId)} está fuera por el líbero: vuelve cuando el líbero salga.` };
  if (d.inhabilitadosLibero.has(jugadorId)) return { tipo: 'aviso', texto: `${d.nombre(jugadorId)} no puede volver a jugar en este partido (era líbero y no pudo seguir).` };
  if (d.esLiberoId(saleId)) return { tipo: 'aviso', texto: 'El líbero no se sustituye: sácalo con su botón y vuelve quien reemplazó.' };
  return { tipo: 'cambio', saleId, entraId: jugadorId };
}
