// Avisos durante el partido: cuántos cambios quedan y qué pasa con la líbero. Son funciones puras (sin pantalla).
import { INDICES_LIBERO } from './reglas/liberos.js';
import { errorJugadaCompletaLibero } from './reglas/reglasSustitucion.js';
import { rotar } from './reglas/rotaciones.js';

const CLAVE = 'roots-avisos';

// Los avisos vienen activados; se pueden apagar desde el menú del partido.
export function avisosActivados(almacen = globalThis.localStorage) {
  try {
    return JSON.parse(almacen.getItem(CLAVE) ?? '{}').activos !== false;
  } catch {
    return true;
  }
}

export function guardarAvisosActivados(activos, almacen = globalThis.localStorage) {
  try {
    almacen.setItem(CLAVE, JSON.stringify({ activos: activos !== false }));
  } catch {
    /* sin almacenamiento local: vale solo para esta sesión */
  }
}

// Cambios (sustituciones) que le quedan al equipo en el set. Los de líbero y los excepcionales no cuentan.
export function cambiosDelSet({ usados, maximo }) {
  const restantes = Math.max(0, maximo - usados);
  const texto = restantes === 0 ? 'Sin cambios' : restantes === 1 ? 'Queda 1 cambio' : `Quedan ${restantes} cambios`;
  const nivel = restantes === 0 ? 'ninguno' : restantes <= 2 ? 'poco' : 'ok';
  return { usados, maximo, restantes, texto, nivel, aviso: restantes === 0 ? 'Ya no quedan cambios en este set (el líbero y el cambio excepcional no cuentan).' : `${texto} en este set.` };
}

// ¿Pasó a quedar poco? Solo avisa cuando baja a 2, 1 o 0 (no al deshacer ni al empezar un set).
export function bajoElLimite(antes, ahora) {
  return antes != null && ahora < antes && ahora <= 2;
}

// Líberos que SALEN en la próxima rotación: pasa cuando el equipo recupera el saque (rival sacando) y la rotación los
// lleva a P1 o a la delantera. Solo se avisa cuando estamos recibiendo, que es cuando la próxima jugada puede rotar.
//   slots: 6 casillas (índice 0 = P1)   reemplazados: Map liberoId -> jugadora que reemplazó   sacamos: true / false / null
export function liberosQueSaldran({ slots, idsLibero, reemplazados, sacamos }) {
  if (sacamos !== false || slots.filter((id) => id != null).length < 6) return [];
  const despues = rotar(slots, 1);
  return idsLibero
    .filter((id) => slots.includes(id) && reemplazados.has(id))
    .map((id) => ({ liberoId: id, vuelveId: reemplazados.get(id), posicion: slots.indexOf(id) + 1, indiceDespues: despues.indexOf(id) }))
    .filter((x) => x.indiceDespues === 0 || !INDICES_LIBERO.includes(x.indiceDespues))
    .map(({ indiceDespues, ...resto }) => resto);
}

// Líbero fuera de cancha y una central en la zaguera (P5, P6 o P1 si no es quien saca): es el momento habitual de entrar.
// Respeta la regla 19.3.2.1 (hace falta un punto entre dos cambios de líbero) y que el líbero no entra por quien saca.
//   ultimoCambio: último cambio de líbero del set ({ puntosLocal, puntosVisitante }) o null    puntos: marcador actual
export function liberoPuedeEntrar({ slots, idsLibero, jugadoresPorId, sacamos, ultimoCambio, puntosLocal, puntosVisitante }) {
  if (sacamos == null || slots.filter((id) => id != null).length < 6) return null;
  const liberoFuera = idsLibero.find((id) => !slots.includes(id));
  if (liberoFuera == null) return null;
  if (errorJugadaCompletaLibero({ ultimoCambio, puntosLocal, puntosVisitante })) return null;
  for (const indice of INDICES_LIBERO) {
    if (indice === 0 && sacamos === true) continue; // quien saca no se cambia por la líbero
    const id = slots[indice];
    if (id == null || idsLibero.includes(id)) continue;
    if (jugadoresPorId.get(id)?.posicion === 'Central') return { liberoId: liberoFuera, saleId: id, posicion: indice + 1 };
  }
  return null;
}
