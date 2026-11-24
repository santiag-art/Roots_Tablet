// Reglas de voleibol para el marcador de un set. Son funciones puras (sin Express ni base de datos)
// para poder probarlas solas; el middleware validarResultadoSet de app.js solo trae los datos y las usa.

// Mínimo de puntos para ganar: 25 en los sets normales y 15 en el decisivo (3.º de 3 o 5.º de 5).
function formatoDeSets(formatoSets) {
  const totalSets = formatoSets === 'mejor_de_5' ? 5 : 3;
  return { totalSets, setsParaGanar: totalSets === 5 ? 3 : 2 };
}

// Un set termina cuando alguien llega al mínimo de puntos Y le saca al menos 2 de diferencia al rival.
// Si se alarga más allá del mínimo, termina exactamente con 2 de diferencia (26-24, 27-25...).
// Devuelve el mensaje de error, o null si el marcador es válido.
function errorMarcadorSet({ numeroSet, totalSets, puntosLocal, puntosVisitante }) {
  const numero = Number(numeroSet);
  const local = Number(puntosLocal);
  const visitante = Number(puntosVisitante);

  if (![numero, local, visitante].every(Number.isInteger) || local < 0 || visitante < 0) {
    return 'El marcador de un set debe ser de números enteros, sin negativos.';
  }
  if (numero < 1 || numero > totalSets) {
    return `En un partido ${totalSets === 5 ? 'al mejor de 5' : 'al mejor de 3'} solo puede haber sets del 1 al ${totalSets}.`;
  }

  const esDecisivo = numero === totalSets;
  const minimo = esDecisivo ? 15 : 25;
  const ganador = Math.max(local, visitante);
  const diferencia = Math.abs(local - visitante);

  if (diferencia < 2) {
    return `Un set no puede terminar con menos de 2 puntos de diferencia (${local}-${visitante}).`;
  }
  if (ganador < minimo) {
    return `${esDecisivo ? 'El set decisivo' : 'Este set'} necesita al menos ${minimo} puntos para el equipo que gana (recibido ${local}-${visitante}).`;
  }
  if (ganador > minimo && diferencia !== 2) {
    return `Pasando de ${minimo} puntos el set termina exactamente con 2 de diferencia; ${local}-${visitante} no es un marcador posible.`;
  }
  return null;
}

// Un set nuevo va en orden, sin repetirse, y solo si el partido todavía no está decidido.
// `existentes` son los sets ya guardados del partido: [{ numeroSet, puntosLocal, puntosVisitante }].
function errorOrdenSet({ numeroSet, existentes, setsParaGanar }) {
  const numero = Number(numeroSet);
  if (existentes.some((s) => s.numeroSet === numero)) {
    return `El set ${numero} ya está registrado en este partido.`;
  }
  const siguiente = existentes.length ? Math.max(...existentes.map((s) => s.numeroSet)) + 1 : 1;
  if (numero !== siguiente) {
    return `Los sets se registran en orden: el siguiente es el set ${siguiente}.`;
  }
  const ganadosLocal = existentes.filter((s) => s.puntosLocal > s.puntosVisitante).length;
  const ganadosVisitante = existentes.filter((s) => s.puntosVisitante > s.puntosLocal).length;
  if (ganadosLocal >= setsParaGanar || ganadosVisitante >= setsParaGanar) {
    return `El partido ya está decidido (${ganadosLocal}-${ganadosVisitante} en sets); no se pueden registrar más sets.`;
  }
  return null;
}

export { formatoDeSets, errorMarcadorSet, errorOrdenSet };
