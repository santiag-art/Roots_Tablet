// Nombres de posición sin marca de género.
// Para cambiar un nombre, se edita aquí y en EQUIVALENCIAS (si antes se llamaba distinto).
export const POSICIONES = [
  'Atacante',
  'Colocación',
  'Líbero',
  'Central',
  'Ataque opuesto',
];

// Nombres anteriores (con género) -> nombre actual. Sirven para los jugadores que
// ya estaban guardados con "Colocadora" u "Opuesta": se ven bien sin tocar la base de datos.
const EQUIVALENCIAS = {
  colocadora: 'Colocación',
  colocador: 'Colocación',
  opuesta: 'Ataque opuesto',
  opuesto: 'Ataque opuesto',
  libera: 'Líbero',
};

export function posicionNeutra(posicion) {
  if (!posicion) return posicion;
  return EQUIVALENCIAS[String(posicion).trim().toLowerCase()] ?? posicion;
}
