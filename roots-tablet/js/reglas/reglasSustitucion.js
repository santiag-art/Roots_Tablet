// Reglas de voleibol (FIVB 2025-2028) sobre sustituciones y líbero. Son funciones puras para poder probarlas solas.

// Regla 15.6: una titular puede salir una vez por set y volver una vez, solo a su posición anterior (cambiando
// por la suplente que la reemplazó). Una suplente entra una sola vez por set y solo puede ser reemplazada por la
// titular a la que sustituyó. Los cambios de líbero no cuentan y no se envían aquí.
//   titularesIds: ids de la línea titular de ese set (sin líbero)
//   previas: sustituciones ya hechas en el set (sin líbero), [{ jugadorSaleId, jugadorEntraId }]
// Devuelve el mensaje de error, o null si el cambio es legal.
function errorReingreso({ salidaId, entraId, titularesIds, previas }) {
  const esTitular = (id) => titularesIds.includes(id);
  const yaEntro = (id) => previas.some((p) => p.jugadorEntraId === id && !p.excepcional);
  const salidaPrevia = previas.find((p) => p.jugadorSaleId === entraId && !p.excepcional);

  if (previas.some((p) => p.excepcional && p.jugadorSaleId === entraId)) {
    return 'Esa jugadora salió por un cambio excepcional (lesión, enfermedad o expulsión) y no puede volver a entrar en el partido (regla 15.7).';
  }

  if (esTitular(entraId)) {
    if (!salidaPrevia) return null; // no había salido: no es un reingreso (la pantalla no deja entrar a quien está en cancha)
    if (yaEntro(entraId)) {
      return 'Esa titular ya salió y volvió una vez en este set; no puede entrar de nuevo (regla 15.6).';
    }
    if (salidaId !== salidaPrevia.jugadorEntraId) {
      return 'Una titular solo puede volver a su posición, cambiando por la suplente que la reemplazó (regla 15.6).';
    }
    return null;
  }

  // Entra una suplente
  if (yaEntro(entraId)) {
    return 'Esa suplente ya entró en este set; solo puede entrar una vez y solo puede salir por la titular a la que reemplazó (regla 15.6).';
  }
  if (!esTitular(salidaId)) {
    return 'Una suplente solo puede ser reemplazada por la titular a la que sustituyó; no se puede cambiar por otra suplente (regla 15.6).';
  }
  if (yaEntro(salidaId)) {
    return 'Esa titular ya salió y volvió una vez en este set; no puede salir de nuevo (regla 15.6).';
  }
  return null;
}


// Regla 15.7: si una jugadora (no el líbero) no puede seguir por lesión, enfermedad o expulsión y no hay una sustitución
// legal posible, el equipo hace un cambio excepcional: entra cualquier jugadora que no esté en cancha, menos el líbero y
// la jugadora a la que el líbero reemplazó. No cuenta dentro de las 6 sustituciones, y la que sale no vuelve a entrar.
//   regularesUsadas: sustituciones normales ya hechas en el set (sin líbero ni excepcionales)
//   idsLibero / reemplazadasPorLibero: líberos del set y jugadoras que ahora mismo están fuera por un líbero
// Devuelve el mensaje de error, o null si el cambio excepcional es legal.
function errorCambioExcepcional({ salidaId, entraId, titularesIds, previas, regularesUsadas, idsLibero = [], reemplazadasPorLibero = [], maxSustituciones = 6 }) {
  if (idsLibero.includes(salidaId)) {
    return 'El cambio excepcional no aplica al líbero: si no puede seguir, el entrenador lo declara no apto y designa otro líbero (regla 19.4).';
  }
  if (idsLibero.includes(entraId)) return 'Un líbero no puede entrar en un cambio excepcional (regla 15.7).';
  if (reemplazadasPorLibero.includes(entraId)) {
    return 'No puede entrar la jugadora a la que el líbero reemplazó en este momento (regla 15.7).';
  }
  if (previas.some((p) => p.excepcional && p.jugadorSaleId === entraId)) {
    return 'Esa jugadora salió por un cambio excepcional y no puede volver a entrar en el partido (regla 15.7).';
  }
  // Solo se usa si no hay una sustitución legal: con el límite agotado, o si este cambio no cabe en la regla 15.6.
  const normal = regularesUsadas < maxSustituciones
    ? errorReingreso({ salidaId, entraId, titularesIds, previas: previas.filter((p) => !p.excepcional) })
    : 'Ya se usaron las sustituciones permitidas.';
  if (normal === null) {
    return 'Este cambio sí es legal como sustitución normal; el cambio excepcional solo se usa cuando no hay una sustitución legal posible (regla 15.7).';
  }
  return null;
}

// Quiénes están en cancha ahora: la línea titular del set (sin líbero) con las sustituciones aplicadas en orden
// (normales, excepcionales y entradas/salidas de líbero). La designación de un nuevo líbero no mueve a nadie de la cancha.
function idsEnCancha(titularesIds, sustituciones) {
  const ordenadas = [...sustituciones]
    .filter((s) => !s.nuevoLibero)
    .sort((a, b) => new Date(a.creado_en ?? a.creadoEn ?? 0) - new Date(b.creado_en ?? b.creadoEn ?? 0) || (a.id ?? 0) - (b.id ?? 0));
  let ids = [...titularesIds];
  for (const s of ordenadas) ids = ids.map((id) => (id === s.jugadorSaleId ? s.jugadorEntraId : id));
  return ids;
}

// Regla 19.4: si el líbero no puede seguir (lesión, enfermedad, expulsión o descalificación), el entrenador lo declara no apto y,
// si no queda otro líbero, designa como nuevo líbero a otra jugadora que no esté en cancha, por el resto del partido.
// La jugadora declarada no apta no vuelve a jugar en el partido (19.4.2.2).
//   lesionadoId: el líbero que no puede seguir
//   nuevoId: la jugadora que pasa a ser líbero
//   idsLiberoSet: líberos del set en curso (incluye al lesionado)
//   inhabilitadosIds: jugadoras ya declaradas no aptas como líbero en este partido (de cualquier set)
//   enCanchaIds: jugadoras que están en cancha ahora (ver idsEnCancha)
//   salieronExcepcionalIds: jugadoras que salieron por cambio excepcional en el partido (15.7: no vuelven)
// Devuelve el mensaje de error, o null si la designación es legal.
function errorNuevoLibero({ lesionadoId, nuevoId, idsLiberoSet = [], inhabilitadosIds = [], enCanchaIds = [], salieronExcepcionalIds = [] }) {
  if (!idsLiberoSet.includes(lesionadoId)) {
    return 'La jugadora que no puede seguir debe ser un líbero de este set (regla 19.4.1).';
  }
  if (inhabilitadosIds.includes(lesionadoId)) {
    return 'Ese líbero ya fue declarado no apto en este partido (regla 19.4.2.2).';
  }
  if (lesionadoId === nuevoId) {
    return 'El nuevo líbero debe ser otra jugadora distinta a la que no puede seguir (regla 19.4.2.1).';
  }
  if (enCanchaIds.includes(lesionadoId)) {
    return 'El líbero que no puede seguir debe salir de la cancha antes de designar a su reemplazo (regla 19.4.2.1).';
  }
  const quedaOtroLibero = idsLiberoSet.some((id) => id !== lesionadoId && !inhabilitadosIds.includes(id));
  if (quedaOtroLibero) {
    return 'El equipo puede seguir con el otro líbero; solo se designa uno nuevo cuando no queda ningún líbero disponible (regla 19.4.3).';
  }
  if (idsLiberoSet.includes(nuevoId)) {
    return 'Esa jugadora ya es líbero en este set (regla 19.4.2.1).';
  }
  if (inhabilitadosIds.includes(nuevoId)) {
    return 'Esa jugadora fue declarada no apta como líbero y no puede volver a jugar en el partido (regla 19.4.2.2).';
  }
  if (enCanchaIds.includes(nuevoId)) {
    return 'El nuevo líbero no puede estar en cancha; debe ser una jugadora que esté fuera en este momento (regla 19.4.2.1).';
  }
  if (salieronExcepcionalIds.includes(nuevoId)) {
    return 'Esa jugadora salió por un cambio excepcional y no puede volver a entrar en el partido (regla 15.7).';
  }
  return null;
}

// Regla 19.3.2.1: entre dos cambios de líbero (entrar o salir) debe haberse completado una jugada. Cada cambio guarda el
// marcador del set en ese momento: si es el mismo que en el cambio anterior, no hubo punto y por tanto no hubo jugada completa.
// Excepciones: el líbero que sale porque no puede seguir (19.4) y el que sale solo porque la rotación lo lleva a P1 o a la delantera.
//   ultimoCambio: el cambio de líbero anterior del set ({ puntosLocal, puntosVisitante }) o null si no hay
//   puntosLocal / puntosVisitante: marcador del set en el cambio nuevo
// Devuelve el mensaje de error, o null si es legal.
function errorJugadaCompletaLibero({ ultimoCambio, puntosLocal, puntosVisitante, exento = false }) {
  if (exento || !ultimoCambio) return null;
  if (!Number.isFinite(puntosLocal) || !Number.isFinite(puntosVisitante)) return null;
  if (Number(ultimoCambio.puntosLocal) === puntosLocal && Number(ultimoCambio.puntosVisitante) === puntosVisitante) {
    return 'Entre dos cambios de líbero debe jugarse una jugada completa: espera a que se anote un punto (regla 19.3.2.1).';
  }
  return null;
}

// Regla 19.3.1.3: el líbero no puede sacar ni bloquear (ni intentar bloquear).
const FUNDAMENTOS_PROHIBIDOS_LIBERO = ['Saque', 'Bloqueo'];

function errorFundamentoLibero(fundamento) {
  if (FUNDAMENTOS_PROHIBIDOS_LIBERO.includes(fundamento)) {
    return `El líbero no puede ${fundamento === 'Saque' ? 'sacar' : 'bloquear'} (regla 19.3.1.3): no se le registra ${fundamento.toLowerCase()}.`;
  }
  return null;
}

export { errorReingreso, errorCambioExcepcional, errorNuevoLibero, errorJugadaCompletaLibero, idsEnCancha, errorFundamentoLibero, FUNDAMENTOS_PROHIBIDOS_LIBERO };
