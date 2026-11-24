// Disponibilidad para jugar mientras dura una lesión (copia de frontend/src/utils/notas.js de Roots).
// El archivo que Roots entrega a la tablet trae solo: jugadorId, zona, gravedad y disponibilidad (sin descripciones médicas).
export const DISPONIBILIDADES = [
  { value: 'apta', label: 'Apta para jugar', corto: 'Apta' },
  { value: 'limitada', label: 'Limitada', corto: 'Limitada' },
  { value: 'no_apta', label: 'No apta', corto: 'No apta' },
];

export const DISPONIBILIDAD_POR_VALOR = Object.fromEntries(DISPONIBILIDADES.map((d) => [d.value, d]));

// Lesiones guardadas antes de existir el campo: grave no juega, el resto con limitación.
export function disponibilidadDeLesion(lesion) {
  if (lesion.disponibilidad) return lesion.disponibilidad;
  return lesion.gravedad === 'grave' ? 'no_apta' : 'limitada';
}

// De la lista de lesiones sin recuperar saca, por jugador, la peor disponibilidad y las zonas afectadas.
// Quien no aparece en el mapa está apto sin lesiones.
export function disponibilidadPorJugador(lesionesActivas) {
  const gravedad = { apta: 0, limitada: 1, no_apta: 2 };
  const mapa = new Map();
  lesionesActivas.forEach((l) => {
    const disp = disponibilidadDeLesion(l);
    const actual = mapa.get(l.jugadorId);
    if (!actual) {
      mapa.set(l.jugadorId, { disponibilidad: disp, zonas: [l.zona].filter(Boolean) });
      return;
    }
    if (gravedad[disp] > gravedad[actual.disponibilidad]) actual.disponibilidad = disp;
    if (l.zona && !actual.zonas.includes(l.zona)) actual.zonas.push(l.zona);
  });
  return mapa;
}
