// Rachas y alertas en vivo: ayudan a la entrenadora a decidir un tiempo muerto. Funciones puras (sin pantalla).
//
// Los umbrales están aquí arriba para cambiarlos fácil: "atencion" es el primer aviso (amarillo) y "urgente"
// es cuando ya conviene actuar (rojo).

export const UMBRAL_RACHA_RIVAL = { atencion: 3, urgente: 4 };

// Errores seguidos de una misma jugadora en un fundamento (se cuentan sus jugadas de ese fundamento, una tras otra).
export const UMBRALES_ERRORES = [
  { fundamento: 'Saque', plural: 'errores de saque', atencion: 2, urgente: 3 },
  { fundamento: 'Recepción', plural: 'errores de recepción', atencion: 3, urgente: 4 },
  { fundamento: 'Ataque', plural: 'errores de ataque', atencion: 3, urgente: 4 },
];

// Racha de puntos que va corriendo: { lado, largo } o null si no hay puntos.
export function rachaDePuntos(puntosSeq = []) {
  if (!puntosSeq.length) return null;
  const lado = puntosSeq.at(-1);
  let largo = 0;
  for (let i = puntosSeq.length - 1; i >= 0 && puntosSeq[i] === lado; i -= 1) largo += 1;
  return { lado, largo };
}

// Cuántos errores seguidos lleva (al final de sus jugadas de ese fundamento) cada jugadora. Map jugadorId -> número (solo > 0).
export function erroresSeguidosPorJugadora(eventos, fundamento) {
  const porJugadora = new Map();
  for (const e of eventos) {
    if (e.fundamento !== fundamento) continue;
    porJugadora.set(e.jugadorId, e.calificacion === 'error' ? (porJugadora.get(e.jugadorId) ?? 0) + 1 : 0);
  }
  return new Map([...porJugadora].filter(([, n]) => n > 0));
}

const nivelDe = (n, umbral) => (n >= umbral.urgente ? 'urgente' : n >= umbral.atencion ? 'atencion' : null);

// Alertas del set en juego. Devuelve una lista ordenada (las urgentes primero):
//   { clave, tipo: 'racha-rival' | 'errores', nivel: 'atencion' | 'urgente', texto, sugiereTiempoMuerto, jugadorId? }
//
//   puntosSeq        quién anotó cada punto del set
//   eventos          jugadas del set en juego
//   ladoPropio       'local' | 'visitante'
//   nombres          { local, visitante }
//   enCancha         ids de las jugadoras que están jugando (a las que salieron no se les avisa)
//   tmDisponibles    tiempos muertos que le quedan a nuestro equipo en el set
//   nombreDe         id -> nombre corto de la jugadora
export function alertasEnVivo({ puntosSeq = [], eventos = [], ladoPropio, nombres = {}, enCancha = [], tmDisponibles = 0, nombreDe = (id) => String(id) }) {
  const alertas = [];
  const racha = rachaDePuntos(puntosSeq);
  if (racha && ladoPropio && racha.lado !== ladoPropio) {
    const nivel = nivelDe(racha.largo, UMBRAL_RACHA_RIVAL);
    if (nivel) {
      const rival = nombres[racha.lado] ?? 'El rival';
      alertas.push({
        clave: `racha-rival:${racha.largo}`,
        tipo: 'racha-rival',
        nivel,
        sugiereTiempoMuerto: tmDisponibles > 0,
        texto: `${rival} lleva ${racha.largo} puntos seguidos. ${tmDisponibles > 0 ? `¿Tiempo muerto? Te quedan ${tmDisponibles}.` : 'Ya no te quedan tiempos muertos en este set.'}`,
      });
    }
  }
  for (const regla of UMBRALES_ERRORES) {
    for (const [jugadorId, n] of erroresSeguidosPorJugadora(eventos, regla.fundamento)) {
      if (!enCancha.includes(jugadorId)) continue;
      const nivel = nivelDe(n, regla);
      if (!nivel) continue;
      alertas.push({
        clave: `errores:${regla.fundamento}:${jugadorId}:${n}`,
        tipo: 'errores',
        nivel,
        jugadorId,
        fundamento: regla.fundamento,
        sugiereTiempoMuerto: false,
        texto: `${n} ${regla.plural} seguidos de ${nombreDe(jugadorId)}.`,
      });
    }
  }
  return alertas.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'urgente' ? -1 : 1));
}
