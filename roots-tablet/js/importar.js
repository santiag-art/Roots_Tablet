// Importar el archivo que Roots entrega a la tablet (Roots > Anotación en vivo > Exportar para tablet).
//
// Dos pasos, para poder probarlos sin pantalla:
//   1. leerArchivoRoots(texto)  -> valida y limpia el archivo; si algo no cuadra, lanza ErrorImportacion con un mensaje claro.
//   2. aplicarImportacion(...)  -> lo mezcla con lo que ya hay en la tablet SIN pisar lo que ya se anotó.
import { nuevoEstadoPartido, setEnCursoTieneDatos } from './motor.js';
import { disponibilidadDeLesion } from './reglas/disponibilidad.js';

export const APLICACION_ROOTS = 'roots-tablet'; // lo que genera Roots
export const APLICACION_RESULTADOS = 'roots-tablet-resultados'; // lo que genera la tablet
export const VERSION_FORMATO = 1;

export class ErrorImportacion extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorImportacion';
  }
}

const GENEROS = ['femenino', 'masculino'];
const FORMATOS = ['mejor_de_3', 'mejor_de_5'];
const DISPONIBILIDADES = ['apta', 'limitada', 'no_apta'];

const esEntero = (x) => Number.isInteger(x);
const texto = (x) => (typeof x === 'string' ? x.trim() : '');
const fallo = (mensaje) => {
  throw new ErrorImportacion(mensaje);
};

function exigirLista(valor, nombre) {
  if (!Array.isArray(valor)) fallo(`El archivo está incompleto: falta la lista de ${nombre}.`);
  return valor;
}

export function leerArchivoRoots(contenido) {
  let datos;
  try {
    datos = typeof contenido === 'string' ? JSON.parse(contenido.replace(/^﻿/, '')) : contenido;
  } catch {
    fallo('No pude leer el archivo: no es un JSON válido. Descárgalo de nuevo desde Roots (puede haberse cortado al enviarlo).');
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) fallo('Ese archivo no es de Roots.');

  if (datos.aplicacion === APLICACION_RESULTADOS) {
    fallo('Ese archivo son resultados de la tablet, no partidos de Roots. Aquí se importa el que descargaste en Roots con "Exportar para tablet".');
  }
  if (datos.aplicacion !== APLICACION_ROOTS) {
    fallo('Ese archivo no es de Roots. Descárgalo desde Roots > Anotación en vivo > Exportar para tablet.');
  }
  if (!esEntero(datos.version) || datos.version < 1) fallo('El archivo no dice de qué versión es. Descárgalo de nuevo desde Roots.');
  if (datos.version > VERSION_FORMATO) {
    fallo('Ese archivo es de una versión más nueva de Roots. Actualiza la app de la tablet (ábrela con internet una vez) e inténtalo otra vez.');
  }
  const idExportacion = texto(datos.idExportacion);
  if (!idExportacion) fallo('El archivo no trae su identificador. Descárgalo de nuevo desde Roots.');

  // ── torneos ──
  const torneos = exigirLista(datos.torneos, 'torneos').map((t, i) => {
    if (!esEntero(t?.id)) fallo(`Torneo ${i + 1}: falta el id.`);
    if (!GENEROS.includes(t.genero)) fallo(`El torneo "${texto(t.nombre) || t.id}" no dice si es femenino o masculino.`);
    return {
      id: t.id,
      nombre: texto(t.nombre) || `Torneo ${t.id}`,
      genero: t.genero,
      categoria: texto(t.categoria) || null,
      fechaInicio: texto(t.fechaInicio) || null,
      fechaFin: texto(t.fechaFin) || null,
    };
  });
  const idsTorneo = new Set(torneos.map((t) => t.id));

  // ── jugadores ── (solo lo que la pantalla de anotación necesita)
  const jugadores = exigirLista(datos.jugadores, 'jugadores').map((j, i) => {
    if (!esEntero(j?.id)) fallo(`Jugador ${i + 1}: falta el id.`);
    if (!texto(j.nombre)) fallo(`El jugador ${j.id} no tiene nombre.`);
    if (!GENEROS.includes(j.genero)) fallo(`${texto(j.nombre)} no tiene género (femenino o masculino).`);
    return {
      id: j.id,
      nombre: texto(j.nombre),
      numero: esEntero(j.numero) ? j.numero : null,
      posicion: texto(j.posicion),
      genero: j.genero,
      categoria: texto(j.categoria) || null,
    };
  });
  const idsJugador = new Set(jugadores.map((j) => j.id));

  // ── partidos ──
  const partidos = exigirLista(datos.partidos, 'partidos').map((p, i) => {
    if (!esEntero(p?.id)) fallo(`Partido ${i + 1}: falta el id.`);
    if (!idsTorneo.has(p.torneoId)) fallo(`El partido ${p.id} es de un torneo que no viene en el archivo. Descárgalo de nuevo desde Roots.`);
    const equipoLocal = texto(p.equipoLocal);
    const equipoVisitante = texto(p.equipoVisitante);
    if (!equipoLocal || !equipoVisitante) fallo(`El partido ${p.id} no tiene los dos equipos.`);
    if (p.formatoSets != null && !FORMATOS.includes(p.formatoSets)) fallo(`El partido ${p.id} trae un formato de sets desconocido.`);
    return {
      id: p.id,
      torneoId: p.torneoId,
      equipoLocal,
      equipoVisitante,
      fecha: texto(p.fecha),
      hora: texto(p.hora),
      formatoSets: p.formatoSets ?? null,
      setsGuardados: esEntero(p.setsGuardados) && p.setsGuardados > 0 ? p.setsGuardados : 0,
    };
  });
  if (partidos.length === 0) fallo('El archivo no trae ningún partido.');
  // Cada torneo con partidos necesita jugadores de su género; si no, el partido no se podría jugar.
  new Set(partidos.map((p) => p.torneoId)).forEach((idTorneo) => {
    const torneo = torneos.find((t) => t.id === idTorneo);
    if (!jugadores.some((j) => j.genero === torneo.genero)) {
      fallo(`El archivo no trae jugadores ${torneo.genero === 'femenino' ? 'femeninos' : 'masculinos'} para "${torneo.nombre}". Descárgalo de nuevo desde Roots.`);
    }
  });

  // ── lesiones (opcional) ──
  const lesiones = (Array.isArray(datos.lesiones) ? datos.lesiones : [])
    .filter((l) => idsJugador.has(l?.jugadorId))
    .map((l) => {
      const disponibilidad = disponibilidadDeLesion({ disponibilidad: DISPONIBILIDADES.includes(l.disponibilidad) ? l.disponibilidad : null, gravedad: l.gravedad });
      return { jugadorId: l.jugadorId, zona: texto(l.zona) || null, gravedad: texto(l.gravedad) || null, disponibilidad };
    });

  return { idExportacion, exportadoEn: texto(datos.exportadoEn) || null, torneos, partidos, jugadores, lesiones };
}

// ¿Este partido ya tiene algo anotado en la tablet? Si sí, nunca se pisa.
export function tieneProgreso(registro) {
  const est = registro?.est;
  if (!est) return false;
  return est.sets.length > 0 || est.finalizado || setEnCursoTieneDatos(est);
}

// Mezcla el archivo con lo que ya hay. Devuelve un resumen para mostrarle a la persona.
export async function aplicarImportacion(almacen, datos, { nombreArchivo = null, ahora = new Date() } = {}) {
  const yaImportado = Boolean(await almacen.uno('importaciones', datos.idExportacion));

  const existentes = new Map((await almacen.todos('partidos')).map((p) => [p.id, p]));
  const resumen = { yaImportado, nuevos: 0, actualizados: 0, conservados: 0, jugadores: datos.jugadores.length, torneos: datos.torneos.length, partidosConSetsEnRoots: 0 };

  const registros = datos.partidos.map((p) => {
    if (p.setsGuardados > 0) resumen.partidosConSetsEnRoots += 1;
    const previo = existentes.get(p.id);
    const base = {
      id: p.id,
      torneoId: p.torneoId,
      fecha: p.fecha,
      hora: p.hora,
      setsEnRoots: p.setsGuardados,
      importadoDe: [...new Set([...(previo?.importadoDe ?? []), datos.idExportacion])],
    };
    if (!previo) {
      resumen.nuevos += 1;
      return { ...base, equipoLocal: p.equipoLocal, equipoVisitante: p.equipoVisitante, recibidoEn: ahora.toISOString(), est: nuevoEstadoPartido(p) };
    }
    if (tieneProgreso(previo)) {
      // Lo anotado manda: solo se actualizan la fecha, la hora y cuántos sets tiene Roots.
      resumen.conservados += 1;
      return { ...previo, ...base, equipoLocal: previo.equipoLocal, equipoVisitante: previo.equipoVisitante };
    }
    resumen.actualizados += 1;
    return { ...previo, ...base, equipoLocal: p.equipoLocal, equipoVisitante: p.equipoVisitante, est: nuevoEstadoPartido(p) };
  });

  await almacen.guardarVarios('torneos', datos.torneos);
  await almacen.guardarVarios('jugadores', datos.jugadores);
  // Las lesiones de cada jugador del archivo se reemplazan (si ya se recuperó, desaparece el aviso).
  const lesionesPorJugador = new Map(datos.jugadores.map((j) => [j.id, []]));
  datos.lesiones.forEach((l) => lesionesPorJugador.get(l.jugadorId)?.push({ zona: l.zona, gravedad: l.gravedad, disponibilidad: l.disponibilidad }));
  await almacen.guardarVarios('lesiones', [...lesionesPorJugador].map(([jugadorId, lista]) => ({ jugadorId, lesiones: lista })));
  await almacen.guardarVarios('partidos', registros);
  await almacen.guardar('importaciones', {
    idExportacion: datos.idExportacion,
    exportadoEn: datos.exportadoEn,
    importadoEn: ahora.toISOString(),
    nombreArchivo,
    partidoIds: datos.partidos.map((p) => p.id),
  });
  return resumen;
}
