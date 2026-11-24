// Qué fundamentos se le evalúan a cada posición en los partidos en vivo.
// Así un líbero solo tiene recepción y defensa, y no se le "evalúa" un ataque que nunca hace.
// Si cambias algo aquí, haz el mismo cambio en backend/src/utils/fundamentosPosicion.js.
import { FUNDAMENTOS } from './anotacion.js';

export const FUNDAMENTOS_POR_POSICION = {
  libero: ['Recepción', 'Defensa'],
  colocacion: ['Ataque', 'Saque', 'Colocación', 'Bloqueo', 'Defensa'],
  atacante: ['Bloqueo', 'Ataque', 'Recepción', 'Defensa', 'Saque'], // la punta
  'ataque opuesto': ['Ataque', 'Bloqueo', 'Defensa', 'Saque'],
  central: ['Bloqueo', 'Recepción', 'Defensa', 'Saque', 'Ataque'],
};

// Orden y nombre con que se muestran las posiciones en las estadísticas.
export const ORDEN_POSICIONES = ['atacante', 'colocacion', 'libero', 'central', 'ataque opuesto'];
export const NOMBRES_POSICION = {
  atacante: 'Atacante',
  colocacion: 'Colocación',
  libero: 'Líbero',
  central: 'Central',
  'ataque opuesto': 'Ataque opuesto',
};

// Nombres alternativos (con género, o "punta") -> clave de arriba.
const ALIAS = {
  libera: 'libero',
  colocadora: 'colocacion',
  colocador: 'colocacion',
  opuesta: 'ataque opuesto',
  opuesto: 'ataque opuesto',
  punta: 'atacante',
};

export function clavePosicion(posicion) {
  const texto = String(posicion ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toLowerCase();
  const clave = ALIAS[texto] ?? texto;
  return FUNDAMENTOS_POR_POSICION[clave] ? clave : null;
}

export function esPosicionLibero(posicion) {
  return clavePosicion(posicion) === 'libero';
}

// Fundamentos que se le pueden anotar a un jugador. `esLibero` es para quien está jugando de líbero en el partido
// (aunque su ficha diga otra posición). Si la posición no se reconoce, se ofrecen todos para no bloquear a nadie.
export function fundamentosPermitidos(jugador, { esLibero = false } = {}) {
  if (esLibero) return FUNDAMENTOS_POR_POSICION.libero;
  const clave = clavePosicion(jugador?.posicion);
  return clave ? FUNDAMENTOS_POR_POSICION[clave] : FUNDAMENTOS;
}

export function puedeRegistrar(jugador, fundamento, opciones) {
  return fundamentosPermitidos(jugador, opciones).includes(fundamento);
}
