// Copia de seguridad de TODO lo que hay en la tablet (partidos con lo anotado, jugadores, torneos).
// No es el archivo de resultados para Roots: es para no perder nada si la tablet se daña o se borra la app.
import { TABLAS } from './store.js';

export const APLICACION_COPIA = 'roots-tablet-copia';
export const VERSION_COPIA = 1;
const TABLAS_COPIA = Object.keys(TABLAS).filter((t) => t !== 'meta');

export class ErrorCopia extends Error {}

const dos = (n) => String(n).padStart(2, '0');

export function nombreArchivoCopia(ahora = new Date(), prefijo = 'roots-tablet-copia') {
  return `${prefijo}-${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}.json`;
}

export async function construirCopia(almacen, { ahora = new Date(), versionApp = '' } = {}) {
  const tablas = {};
  for (const t of TABLAS_COPIA) tablas[t] = await almacen.todos(t);
  return { aplicacion: APLICACION_COPIA, version: VERSION_COPIA, creadaEn: ahora.toISOString(), versionApp, tablas };
}

export function contarCopia(copia) {
  const t = copia.tablas;
  return {
    partidos: t.partidos.length,
    partidosConSets: t.partidos.filter((p) => p.est.sets.length > 0).length,
    jugadores: t.jugadores.length,
    torneos: t.torneos.length,
  };
}

// Lee y valida el texto de una copia. Lanza ErrorCopia con un mensaje claro si algo no cuadra.
export function leerCopia(texto) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    throw new ErrorCopia('No pude leer el archivo: no es una copia válida. Elige un archivo roots-tablet-copia-...json.');
  }
  if (datos?.aplicacion === 'roots-tablet') throw new ErrorCopia('Ese es el archivo que Roots manda a la tablet. Para eso usa "Importar archivo" en el inicio. Aquí se restaura una copia hecha con esta app.');
  if (datos?.aplicacion === 'roots-tablet-resultados') throw new ErrorCopia('Ese es un archivo de resultados para Roots, no una copia de seguridad.');
  if (datos?.aplicacion !== APLICACION_COPIA) throw new ErrorCopia('El archivo no es una copia de seguridad de Roots Tablet.');
  if (datos.version !== VERSION_COPIA) throw new ErrorCopia(`La versión ${datos.version} de la copia no la conozco. Actualiza la app.`);
  if (!datos.tablas || typeof datos.tablas !== 'object') throw new ErrorCopia('La copia no trae datos.');
  for (const t of TABLAS_COPIA) {
    if (!Array.isArray(datos.tablas[t])) throw new ErrorCopia(`A la copia le falta la tabla "${t}": está incompleta o dañada.`);
    const llave = TABLAS[t];
    if (datos.tablas[t].some((f) => f == null || f[llave] == null)) throw new ErrorCopia(`La copia tiene filas dañadas en "${t}".`);
  }
  const ids = new Set();
  for (const p of datos.tablas.partidos) {
    const est = p.est;
    if (!est || !Array.isArray(est.sets) || !est.actual || !Array.isArray(est.actual.slots) || !Array.isArray(est.actual.eventos)) {
      throw new ErrorCopia(`El partido ${p.id} de la copia está dañado.`);
    }
    if (ids.has(p.id)) throw new ErrorCopia(`El partido ${p.id} aparece repetido en la copia.`);
    ids.add(p.id);
  }
  return datos;
}

// Reemplaza TODO lo de la tablet por lo de la copia. Llamar solo tras validar con leerCopia y confirmar.
export async function restaurarCopia(almacen, copia) {
  await almacen.vaciar();
  for (const t of TABLAS_COPIA) await almacen.guardarVarios(t, copia.tablas[t]);
  await almacen.guardar('meta', { clave: 'ultimaCopia', fecha: copia.creadaEn });
  await almacen.pendientes();
}

export async function marcarCopiaHecha(almacen, ahora = new Date()) {
  await almacen.guardar('meta', { clave: 'ultimaCopia', fecha: ahora.toISOString() });
}

// Partidos con algo anotado que cambió después de la última copia (o que nunca se copiaron).
export function partidosSinCopia(partidos, ultimaCopia) {
  return [...partidos].filter((p) => {
    const e = p.est;
    const conProgreso = e.sets.length > 0 || e.actual.eventos.length > 0 || e.actual.puntosLocal + e.actual.puntosVisitante > 0 || e.actual.plantillaConfirmada;
    if (!conProgreso) return false;
    return !ultimaCopia || (e.actualizadoEn ?? '') > ultimaCopia;
  });
}
