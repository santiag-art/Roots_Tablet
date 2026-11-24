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

// ── Rivales que ya existen (para no crear "Halcones" y "Halcones VC" como dos equipos) ──

// Sin tildes, mayúsculas ni signos: "  Águilas FC. " y "aguilas fc" son lo mismo.
export function normalizarNombre(nombre) {
  return String(nombre ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i += 1) {
    let anterior = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const guardado = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return fila[b.length];
}

// ¿Dos nombres distintos podrían ser el mismo equipo? "Halcones" / "Halcones VC", "Titán" / "Titanes", "Aguilas" / "Águila".
function sePareceA(a, b) {
  if (!a || !b || a === b) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  const palabrasLargo = new Set(largo.split(' '));
  if (corto.split(' ').every((w) => palabrasLargo.has(w))) return true; // todas las palabras del corto están en el largo
  if (corto.length >= 4 && largo.startsWith(corto)) return true;
  return corto.length >= 5 && distancia(corto, largo) <= 1;
}

// Todos los rivales de los partidos que hay en la tablet (de cualquier torneo), sin Roots ni repetidos.
export function rivalesExistentes(partidos) {
  const porNombre = new Map();
  for (const p of partidos) {
    for (const n of [p.equipoLocal, p.equipoVisitante]) {
      const limpio = sinEspacios(n);
      const clave = normalizarNombre(limpio);
      if (!clave || esRoots(limpio)) continue;
      const previo = porNombre.get(clave) ?? { nombre: limpio, torneoIds: new Set() };
      previo.torneoIds.add(p.torneoId);
      porNombre.set(clave, previo);
    }
  }
  return [...porNombre.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

// El rival ya existe con otra escritura (mayúsculas, tildes): devuelve el nombre tal como ya está guardado.
export function rivalExacto(escrito, partidos) {
  const clave = normalizarNombre(escrito);
  if (!clave) return null;
  return rivalesExistentes(partidos).find((r) => normalizarNombre(r.nombre) === clave)?.nombre ?? null;
}

// Nombres que se parecen al escrito pero no son iguales: hay que preguntar si es el mismo equipo.
export function rivalesParecidos(escrito, partidos) {
  const clave = normalizarNombre(escrito);
  if (!clave) return [];
  return rivalesExistentes(partidos)
    .filter((r) => sePareceA(clave, normalizarNombre(r.nombre)))
    .map((r) => r.nombre);
}

// Lo que se ofrece mientras se escribe. Sin texto: los del torneo (o todos si el torneo aún no tiene). Con texto: los que lo contienen o se parecen.
export function sugerirRivales(escrito, partidos, torneoId, max = 8) {
  const todos = rivalesExistentes(partidos);
  const clave = normalizarNombre(escrito);
  if (!clave) {
    const delTorneo = todos.filter((r) => r.torneoIds.has(torneoId));
    return (delTorneo.length ? delTorneo : todos).slice(0, max).map((r) => r.nombre);
  }
  return todos
    .map((r) => ({ r, k: normalizarNombre(r.nombre) }))
    .filter(({ k }) => k.includes(clave) || sePareceA(clave, k))
    .sort((a, b) => Number(b.k.startsWith(clave)) - Number(a.k.startsWith(clave)) || Number(b.r.torneoIds.has(torneoId)) - Number(a.r.torneoIds.has(torneoId)) || a.r.nombre.localeCompare(b.r.nombre, 'es'))
    .slice(0, max)
    .map(({ r }) => r.nombre);
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
  // Si ya existe con otra escritura ("halcones vc" vs "Halcones VC"), se usa el nombre que ya está guardado.
  const rivalFinal = rivalExacto(nombreRival, existentes) ?? nombreRival;
  const equipoLocal = rootsDeLocal ? NOMBRE_EQUIPO_PROPIO : rivalFinal;
  const equipoVisitante = rootsDeLocal ? rivalFinal : NOMBRE_EQUIPO_PROPIO;
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
