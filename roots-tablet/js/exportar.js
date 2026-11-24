// Archivo de resultados: lo que la tablet le devuelve a Roots.
//
// Sus campos usan los mismos nombres que las tablas de Roots (sets_partido, titulares_set, sustituciones,
// eventos_partido), para que el paso de importarlo en Roots sea directo. Los ids son solo de la tablet y no
// viajan: el orden de los cambios y las jugadas queda en "orden".
//
// Función pura: no toca la pantalla ni el almacenamiento.
import { APLICACION_RESULTADOS, VERSION_FORMATO } from './importar.js';
import { estadoDePartido } from './resumen.js';

function nuevoId(ahora) {
  return globalThis.crypto?.randomUUID?.() ?? `res-${ahora.getTime()}-${Math.floor(Math.random() * 1e9)}`;
}

const dosDigitos = (n) => String(n).padStart(2, '0');

export function nombreArchivoResultados(ahora = new Date()) {
  return `roots-resultados-${ahora.getFullYear()}-${dosDigitos(ahora.getMonth() + 1)}-${dosDigitos(ahora.getDate())}.json`;
}

// `posicion` es la casilla de la cancha (1 a 6); `posicionJugada`, con qué posición jugó en el partido (Roots la guarda igual).
const titular = (t) => ({ jugadorId: t.jugadorId, esLibero: Boolean(t.esLibero), tipoLibero: t.tipoLibero ?? null, posicion: t.posicion ?? null, posicionJugada: t.esLibero ? null : t.posicionJugada ?? null });

const sustitucion = (s) => ({
  orden: s.id,
  jugadorSaleId: s.jugadorSaleId,
  jugadorEntraId: s.jugadorEntraId,
  porLibero: Boolean(s.porLibero),
  excepcional: Boolean(s.excepcional),
  nuevoLibero: Boolean(s.nuevoLibero),
  // Con qué posición entró (solo en cambios normales; los del líbero no la llevan).
  posicionEntra: s.porLibero || s.nuevoLibero ? null : s.posicionEntra ?? null,
  puntosLocal: s.puntosLocal ?? 0,
  puntosVisitante: s.puntosVisitante ?? 0,
  creadoEn: s.creado_en ?? null,
});

const evento = (e) => ({
  orden: e.id,
  jugadorId: e.jugadorId,
  fundamento: e.fundamento,
  calificacion: e.calificacion,
  enConjunto: Boolean(e.enConjunto),
  paseRecibido: e.paseRecibido ?? null,
  creadoEn: e.creado_en ?? null,
});

export function resultadoDePartido(registro) {
  const est = registro.est;
  const sinSet = est.actual.eventos.map(evento);
  return {
    id: registro.id,
    // Partido que se creó en la tablet: Roots no lo tiene. `idTablet` es único y sirve para crearlo una sola vez en Roots.
    ...(registro.creadoEnTablet ? { creadoEnTablet: true, idTablet: registro.idTablet } : {}),
    torneoId: registro.torneoId,
    equipoLocal: registro.equipoLocal,
    equipoVisitante: registro.equipoVisitante,
    fecha: registro.fecha,
    hora: registro.hora,
    ladoPropio: est.ladoPropio,
    formatoSets: est.formatoSets,
    // "Terminar partido" (o partido decidido por sets): Roots lo marca como finalizado.
    finalizadoManual: estadoDePartido(registro) === 'terminado',
    sets: est.sets.map((s) => ({
      numeroSet: s.numeroSet,
      puntosLocal: s.puntosLocal,
      puntosVisitante: s.puntosVisitante,
      tiemposMuertos: s.tiemposMuertos ?? { local: 0, visitante: 0 },
      titulares: s.titulares.map(titular),
      sustituciones: s.sustituciones.map(sustitucion),
      eventos: s.eventos.map(evento),
    })),
    // Jugadas de un set que no se alcanzó a cerrar: Roots también las deja sin set. Solo viajan si las hay.
    ...(sinSet.length > 0 ? { eventosSinSet: sinSet } : {}),
    iniciadoEn: est.creadoEn ?? null,
    actualizadoEn: est.actualizadoEn ?? null,
  };
}

// registros: los partidos guardados en la tablet. ids: los que se van a exportar.
export function construirResultados({ registros, ids, ahora = new Date() }) {
  const elegidos = registros.filter((r) => ids.includes(r.id) && r.est.sets.length > 0);
  if (elegidos.length === 0) throw new Error('Marca al menos un partido con sets guardados para exportar.');
  const origenes = [...new Set(elegidos.flatMap((r) => r.importadoDe ?? []))];
  return {
    aplicacion: APLICACION_RESULTADOS,
    version: VERSION_FORMATO,
    idResultados: nuevoId(ahora),
    exportadoEn: ahora.toISOString(),
    exportacionesDeOrigen: origenes,
    partidos: elegidos.sort((a, b) => `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`)).map(resultadoDePartido),
  };
}
