// Posición con la que juega cada jugadora EN ESTE PARTIDO (igual que en Roots).
//
// La de su ficha es solo la sugerida: al entrar a la plantilla o por un cambio se pregunta con cuál juega y esa elección
// manda en el partido (de ella dependen los fundamentos que se le pueden anotar). Se guarda en `est.posiciones`
// (jugadoraId -> nombre de la posición) y viaja a Roots con cada titular (`posicionJugada`) y cada entrada por cambio
// (`posicionEntra`). Funciones puras: no tocan la pantalla ni el almacenamiento.
import { POSICIONES, posicionNeutra } from './reglas/posiciones.js';
import { NOMBRES_POSICION, clavePosicion } from './reglas/fundamentosPosicion.js';

// Posiciones que se ofrecen al preguntar (las mismas de Roots).
export const OPCIONES_POSICION = POSICIONES;

const ABREVIATURAS = { atacante: 'Ata', colocacion: 'Col', libero: 'Lib', central: 'Cen', 'ataque opuesto': 'Opu' };

// Nombre estándar de una posición ("Colocadora" -> "Colocación"), o null si no se reconoce.
export function posicionEstandar(posicion) {
  const clave = clavePosicion(posicion);
  return clave ? NOMBRES_POSICION[clave] : null;
}

// Abreviatura para la casilla de la cancha ("Col", "Cen"...); vacío si no se reconoce.
export function abreviaturaPosicion(posicion) {
  const clave = clavePosicion(posicion);
  return clave ? ABREVIATURAS[clave] : '';
}

// ¿Es una posición válida para guardar? (null/undefined = "no se eligió", que también vale)
export function posicionValida(posicion) {
  return posicion == null || clavePosicion(posicion) !== null;
}

// Posición con la que juega hoy: la elegida en el partido o, si no hay, la de su ficha.
export function posicionDeJuego(est, jugador) {
  if (!jugador) return null;
  return est?.posiciones?.[jugador.id] ?? posicionNeutra(jugador.posicion) ?? null;
}

// ¿Eligió el usuario una posición para ella en este partido?
export function tienePosicionElegida(est, jugadorId) {
  return est?.posiciones?.[jugadorId] != null;
}

// La jugadora con su posición del partido en lugar de la de la ficha (para validar fundamentos y agrupar estadísticas).
export function jugadorEnPartido(est, jugador) {
  return jugador ? { ...jugador, posicion: posicionDeJuego(est, jugador) } : jugador;
}
