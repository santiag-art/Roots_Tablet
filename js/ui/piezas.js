// Piezas visuales que comparten las pestañas del partido.
import { app } from '../contexto.js';
import { DISPONIBILIDAD_POR_VALOR } from '../reglas/disponibilidad.js';
import { INFO_LIBERO } from '../reglas/liberos.js';
import { posicionNeutra } from '../reglas/posiciones.js';
import { h } from './dom.js';

export function textoNumero(j) {
  return j?.numero != null ? String(j.numero) : (j?.nombre ?? '?').trim().charAt(0).toUpperCase();
}

// Círculo de una jugadora: número, color si es líbero y aviso de lesión.
export function circuloJugador(V, id, { activo = false, fuera = false, etiquetaLibero = true } = {}) {
  const j = V.d.jugadoresPorId.get(id);
  const tipo = V.d.tipoLiberoPorId.get(id);
  const disp = app.lesiones.get(id)?.disponibilidad;
  return h(
    'span',
    { class: `circulo ${tipo ? `lib-${tipo}` : ''} ${activo ? 'activo' : ''} ${fuera ? 'fuera' : ''}` },
    textoNumero(j),
    disp && disp !== 'apta' ? h('span', { class: `insignia ${disp === 'no_apta' ? 'no-apta' : ''}`, title: DISPONIBILIDAD_POR_VALOR[disp]?.label }, disp === 'no_apta' ? '✕' : '!') : null,
    tipo && etiquetaLibero ? h('span', { class: `tag-lib lib-${tipo}` }, INFO_LIBERO[tipo]?.corto ?? 'L') : null
  );
}

export function circuloVacio(texto = '+') {
  return h('span', { class: 'circulo vacio-c' }, texto);
}

export function insigniaDisponibilidad(id) {
  const disp = app.lesiones.get(id)?.disponibilidad;
  if (!disp || disp === 'apta') return null;
  const zonas = app.lesiones.get(id)?.zonas ?? [];
  return h('span', { class: `insignia-disp ${disp}` }, `${DISPONIBILIDAD_POR_VALOR[disp]?.corto ?? disp}${zonas.length ? ` · ${zonas.join(', ')}` : ''}`);
}

export function subtituloJugador(j) {
  return [j.posicion ? posicionNeutra(j.posicion) : null, j.categoria].filter(Boolean).join(' · ');
}

// Fila grande para elegir una jugadora dentro de una ventana.
export function opcionJugador(V, id, { onclick, nota = '', deshabilitado = false, principal = false } = {}) {
  const j = V.d.jugadoresPorId.get(id);
  return h(
    'button',
    { class: `opcion ${principal ? 'principal' : ''}`, disabled: deshabilitado, onclick },
    circuloJugador(V, id, { etiquetaLibero: false }),
    h('span', { class: 'datos' }, h('strong', {}, j.nombre, insigniaDisponibilidad(id)), h('small', {}, [subtituloJugador(j), nota].filter(Boolean).join(' · ')))
  );
}
