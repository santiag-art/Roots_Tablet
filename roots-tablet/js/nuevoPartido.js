// Partido nuevo creado en la tablet (cuando no alcanzaste a exportarlo desde Roots).
//
// Es un partido como cualquiera de los importados, pero marcado `creadoEnTablet`. Roots no lo conoce, así que:
//   - su id es solo de la tablet (arranca en 1.000.000.000 para no cruzarse nunca con un id de Roots) y
//   - lleva un `idTablet` único que viaja en el archivo de resultados, para que Roots cree el partido una sola vez.
// Funciones puras (sin pantalla ni almacenamiento) para poder probarlas solas.
import { nuevoEstadoPartido } from './motor.js';

export const NOMBRE_EQUIPO_PROPIO = 'Roots';
export const BASE_ID_TABLET = 1_000_000_000;
export const MAX_NOMBRE = 40;

export class ErrorNuevoPartido extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorNuevoPartido';
  }
}

const fallo = (mensaje) => {
  throw new ErrorNuevoPartido(mensaje);
};

const dos = (n) => String(n).padStart(2, '0');
const sinEspacios = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const esRoots = (nombre) => /roots/i.test(nombre ?? '');

export const hoyYAhora = (d = new Date()) => ({ fecha: `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`, hora: `${dos(d.getHours())}:${dos(d.getMinutes())}` });

// Rivales que ya aparecen en los partidos de ese torneo (para elegirlos con un toque, sin escribir).
export function rivalesConocidos(partidos, torneoId) {
  const nombres = new Map();
  for (const p of partidos) {
    if (p.torneoId !== torneoId) continue;
    for (const n of [p.equipoLocal, p.equipoVisitante]) {
      const limpio = sinEspacios(n);
      if (limpio && !esRoots(limpio) && !nombres.has(limpio.toLowerCase())) nombres.set(limpio.toLowerCase(), limpio);
    }
  }
  return [...nombres.values()].sort((a, b) => a.localeCompare(b, 'es'));
}

// Un id que no usa ningún partido que ya esté en la tablet.
export function nuevoIdTablet(existentes, ahora = new Date()) {
  const usados = new Set(existentes.map((p) => p.id));
  let id = BASE_ID_TABLET + (ahora.getTime() % 900_000_000);
  while (usados.has(id)) id += 1;
  return id;
}

function nuevoUuid(ahora) {
  return globalThis.crypto?.randomUUID?.() ?? `tab-${ahora.getTime()}-${Math.floor(Math.random() * 1e9)}`;
}

// datos: { torneo, rival, rootsDeLocal, fecha: 'AAAA-MM-DD', hora: 'HH:MM' }; existentes: partidos ya guardados en la tablet.
export function crearPartidoEnTablet({ torneo, rival, rootsDeLocal = true, fecha, hora }, existentes = [], ahora = new Date()) {
  if (!torneo) fallo('Elige el torneo del partido.');
  const nombreRival = sinEspacios(rival);
  if (!nombreRival) fallo('Elige o escribe el equipo rival.');
  if (nombreRival.length > MAX_NOMBRE) fallo(`El nombre del rival es muy largo (máximo ${MAX_NOMBRE} letras).`);
  if (esRoots(nombreRival)) fallo('El rival no puede llamarse Roots: ese es tu equipo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? '') || Number.isNaN(new Date(`${fecha}T00:00`).getTime())) fallo('La fecha no es válida.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? '')) fallo('La hora no es válida.');
  const equipoLocal = rootsDeLocal ? NOMBRE_EQUIPO_PROPIO : nombreRival;
  const equipoVisitante = rootsDeLocal ? nombreRival : NOMBRE_EQUIPO_PROPIO;
  const id = nuevoIdTablet(existentes, ahora);
  return {
    id,
    idTablet: nuevoUuid(ahora),
    creadoEnTablet: true,
    torneoId: torneo.id,
    equipoLocal,
    equipoVisitante,
    fecha,
    hora: `${hora}:00`,
    setsEnRoots: 0,
    importadoDe: [],
    recibidoEn: ahora.toISOString(),
    est: nuevoEstadoPartido({ id, equipoLocal, equipoVisitante, formatoSets: null }),
  };
}
