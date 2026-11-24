// Historial por rival: junta todos los partidos guardados en la tablet contra el mismo equipo (aunque su nombre cambie de
// mayúsculas o tildes) para ver cómo les ha ido y cómo anota ese rival. Funciones puras (sin pantalla).
import { combinarResumenes, rivalDeRegistro, resumenPuntosRivalDePartido } from './puntosRival.js';

const limpio = (n) => String(n ?? '').trim().replace(/\s+/g, ' ');

// Sets ganados y perdidos por nosotras en los sets guardados de un partido.
export function setsDelPartido(est) {
  let ganados = 0;
  let perdidos = 0;
  for (const s of est.sets) {
    const propios = est.ladoPropio === 'local' ? s.puntosLocal : s.puntosVisitante;
    const rival = est.ladoPropio === 'local' ? s.puntosVisitante : s.puntosLocal;
    if (propios > rival) ganados += 1;
    else if (rival > propios) perdidos += 1;
  }
  return { ganados, perdidos };
}

// 'ganado' | 'perdido' | 'empatado' | null (sin sets guardados). Va por sets: lo que ya se jugó, también si no se cerró el partido.
export function resultadoDelPartido(est) {
  const { ganados, perdidos } = setsDelPartido(est);
  if (ganados + perdidos === 0) return null;
  return ganados > perdidos ? 'ganado' : perdidos > ganados ? 'perdido' : 'empatado';
}

const porFechaDesc = (a, b) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`);

// Un renglón por rival: { clave, nombre, partidos (más reciente primero), ganados, perdidos, empatados, resumen }.
// `normalizar` es el mismo que usa la app para comparar nombres de equipos. El nombre mostrado es el del partido más reciente.
export function rivalesConHistorial(registros, normalizar) {
  const porClave = new Map();
  for (const r of registros) {
    if (!r.est) continue;
    const nombre = limpio(rivalDeRegistro(r));
    const clave = normalizar(nombre);
    if (!clave) continue;
    if (!porClave.has(clave)) porClave.set(clave, []);
    porClave.get(clave).push(r);
  }
  return [...porClave].map(([clave, partidos]) => {
    partidos.sort(porFechaDesc);
    const resultados = partidos.map((p) => resultadoDelPartido(p.est));
    return {
      clave,
      nombre: limpio(rivalDeRegistro(partidos[0])),
      partidos,
      ganados: resultados.filter((x) => x === 'ganado').length,
      perdidos: resultados.filter((x) => x === 'perdido').length,
      empatados: resultados.filter((x) => x === 'empatado').length,
      resumen: combinarResumenes(partidos.map((p) => resumenPuntosRivalDePartido(p.est, 'todo'))),
    };
  }).sort((a, b) => b.partidos.length - a.partidos.length || a.nombre.localeCompare(b.nombre, 'es'));
}

export const rivalPorClave = (registros, clave, normalizar) => rivalesConHistorial(registros, normalizar).find((r) => r.clave === clave) ?? null;
