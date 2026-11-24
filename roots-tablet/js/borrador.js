// Borrador y espejo: lo que protege lo anotado en el set que todavía se está jugando.
//
// El archivo de resultados solo lleva sets cerrados. Si la tablet se apaga o se cierra la app a mitad de un set,
// el borrador permite sacar TODO lo del partido (también el set en juego) y volver a meterlo en la tablet.
// El "espejo" es el mismo borrador, copiado en cada jugada en otro lugar del navegador (localStorage) como segundo
// seguro: si el almacenamiento principal falla, lo último anotado sigue ahí y se recupera al abrir la app.
//
// Todo son funciones puras o reciben el almacén / el almacenamiento como parámetro, para poder probarlas sin pantalla.
import { normalizarEstado, setEnCursoTieneDatos } from './motor.js';

export const APLICACION_BORRADOR = 'roots-tablet-borrador';
export const VERSION_BORRADOR = 1;
export const CLAVE_ESPEJO = 'roots-espejo';

export class ErrorBorrador extends Error {}

const dos = (n) => String(n).padStart(2, '0');

export function nombreArchivoBorrador(ahora = new Date()) {
  return `roots-borrador-${ahora.getFullYear()}-${dos(ahora.getMonth() + 1)}-${dos(ahora.getDate())}-${dos(ahora.getHours())}${dos(ahora.getMinutes())}.json`;
}

// ¿Este partido tiene algo anotado que todavía no es un set guardado?
export function tieneSetEnJuego(registro) {
  return !registro.est.finalizado && setEnCursoTieneDatos(registro.est);
}

// Partidos con un set en juego que cambiaron después del último borrador exportado (o que nunca se exportaron).
export function partidosSinBorrador(partidos, ultimoBorrador) {
  return [...partidos].filter((p) => tieneSetEnJuego(p) && (!ultimoBorrador || (p.est.actualizadoEn ?? '') > ultimoBorrador));
}

export function construirBorrador({ registros, torneos, jugadores, ahora = new Date(), versionApp = '' }) {
  if (!registros.length) throw new ErrorBorrador('No hay partidos para el borrador.');
  const idsTorneo = new Set(registros.map((r) => r.torneoId));
  const torneosDelBorrador = torneos.filter((t) => idsTorneo.has(t.id));
  const generos = new Set(torneosDelBorrador.map((t) => t.genero));
  return {
    aplicacion: APLICACION_BORRADOR,
    version: VERSION_BORRADOR,
    creadoEn: ahora.toISOString(),
    versionApp,
    partidos: structuredClone(registros),
    torneos: structuredClone(torneosDelBorrador),
    jugadores: structuredClone(jugadores.filter((j) => generos.has(j.genero))),
  };
}

// Lee y valida el texto de un borrador. Lanza ErrorBorrador con un mensaje claro si algo no cuadra.
export function leerBorrador(texto) {
  let datos;
  try {
    datos = typeof texto === 'string' ? JSON.parse(texto.replace(/^﻿/, '')) : texto;
  } catch {
    throw new ErrorBorrador('No pude leer el archivo: no es un borrador válido.');
  }
  if (datos?.aplicacion !== APLICACION_BORRADOR) throw new ErrorBorrador('El archivo no es un borrador de Roots Tablet.');
  if (datos.version !== VERSION_BORRADOR) throw new ErrorBorrador(`La versión ${datos.version} del borrador no la conozco. Actualiza la app.`);
  for (const lista of ['partidos', 'torneos', 'jugadores']) {
    if (!Array.isArray(datos[lista])) throw new ErrorBorrador(`Al borrador le falta la lista de ${lista}: está incompleto o dañado.`);
  }
  if (!datos.partidos.length) throw new ErrorBorrador('El borrador no trae partidos.');
  const ids = new Set();
  for (const p of datos.partidos) {
    if (!Number.isInteger(p?.id) || !normalizarEstado(p.est) || !Array.isArray(p.est.sets) || !Array.isArray(p.est.actual.eventos) || !Array.isArray(p.est.actual.slots)) {
      throw new ErrorBorrador(`El partido ${p?.id ?? '?'} del borrador está dañado.`);
    }
    if (ids.has(p.id)) throw new ErrorBorrador(`El partido ${p.id} aparece repetido en el borrador.`);
    ids.add(p.id);
  }
  return datos;
}

// Mete el borrador en la tablet SIN pisar lo más nuevo: si la tablet ya tiene ese partido con cambios iguales o
// posteriores, se deja como está. Los torneos y jugadores solo se agregan si faltan.
// Devuelve { restaurados: [ids], conservados: [ids] }.
export async function aplicarBorrador(almacen, borrador) {
  const torneosActuales = new Set((await almacen.todos('torneos')).map((t) => t.id));
  const jugadoresActuales = new Set((await almacen.todos('jugadores')).map((j) => j.id));
  await almacen.guardarVarios('torneos', borrador.torneos.filter((t) => !torneosActuales.has(t.id)));
  await almacen.guardarVarios('jugadores', borrador.jugadores.filter((j) => !jugadoresActuales.has(j.id)));
  const restaurados = [];
  const conservados = [];
  for (const p of borrador.partidos) {
    const actual = await almacen.uno('partidos', p.id);
    if (actual && (actual.est.actualizadoEn ?? '') >= (p.est.actualizadoEn ?? '')) conservados.push(p.id);
    else {
      await almacen.guardar('partidos', p);
      restaurados.push(p.id);
    }
  }
  await almacen.pendientes();
  return { restaurados, conservados };
}

// ─────────────── Espejo (segundo seguro, en localStorage) ───────────────

const guardaLocal = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // algunos navegadores lanzan error solo por tocar localStorage
  }
};

// Copia el partido (con su torneo y jugadoras) al espejo. Devuelve false si no se pudo; nunca lanza.
export function guardarEspejo(registro, { torneos, jugadores, versionApp = '', ahora = new Date(), ls = guardaLocal() } = {}) {
  if (!ls || !tieneAlgoQueProteger(registro)) return false;
  try {
    ls.setItem(CLAVE_ESPEJO, JSON.stringify(construirBorrador({ registros: [registro], torneos, jugadores, ahora, versionApp })));
    return true;
  } catch {
    return false; // sin espacio o sin permiso: el almacén principal sigue siendo el que manda
  }
}

function tieneAlgoQueProteger(registro) {
  const e = registro.est;
  return e.sets.length > 0 || setEnCursoTieneDatos(e) || e.actual.plantillaConfirmada;
}

export function leerEspejo(ls = guardaLocal()) {
  try {
    const texto = ls?.getItem(CLAVE_ESPEJO);
    return texto ? leerBorrador(texto) : null;
  } catch {
    return null;
  }
}

// Quita el espejo si es de alguno de estos partidos (por ejemplo, al borrarlos a propósito).
export function borrarEspejo(ids = null, ls = guardaLocal()) {
  try {
    const espejo = leerEspejo(ls);
    if (!espejo || ids == null || espejo.partidos.some((p) => ids.includes(p.id))) ls?.removeItem(CLAVE_ESPEJO);
  } catch {
    /* sin almacenamiento local */
  }
}

// Al abrir la app: si el espejo tiene algo más nuevo que el almacén principal, lo devuelve al almacén.
// Devuelve los ids recuperados ([] si no hizo falta nada).
export async function recuperarDesdeEspejo(almacen, ls = guardaLocal()) {
  const espejo = leerEspejo(ls);
  if (!espejo) return [];
  const { restaurados } = await aplicarBorrador(almacen, espejo);
  return restaurados;
}
