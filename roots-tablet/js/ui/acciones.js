// Pestaña "Acciones": fila de círculos (jugadoras y líberos), fundamento y calificación.
import { deshacerUltimaJugada, registrarJugada } from '../motor.js';
import { miniEstadistica, porcentaje } from '../estadisticas.js';
import { CALIFICACIONES } from '../reglas/anotacion.js';
import { fundamentosPermitidos } from '../reglas/fundamentosPosicion.js';
import { INFO_LIBERO } from '../reglas/liberos.js';
import { rotar } from '../reglas/rotaciones.js';
import { h, icono, nombreCorto } from './dom.js';
import { circuloJugador } from './piezas.js';

const SEL = { jugadorId: null, fundamento: null, enConjunto: false, pase: null };
const limpiar = () => Object.assign(SEL, { jugadorId: null, fundamento: null, enConjunto: false, pase: null });

export function reiniciarSeleccion() {
  limpiar();
}

function filaCirculos(V) {
  const { d, est } = V;
  const act = est.actual;
  const estable = rotar(act.slots, -act.rotaciones);
  const boton = (id, { fuera = false, esLib = false } = {}) => {
    const j = d.jugadoresPorId.get(id);
    if (!j) return null;
    const posicion = act.slots.indexOf(id);
    return h(
      'button',
      { class: `jugador-btn ${SEL.jugadorId === id ? 'elegido' : ''}`, disabled: V.bloqueado || fuera, 'aria-pressed': String(SEL.jugadorId === id), 'aria-label': `${j.nombre}${fuera ? ', fuera por el líbero' : ''}`, onclick: () => { if (SEL.jugadorId !== id) { SEL.fundamento = null; SEL.enConjunto = false; SEL.pase = null; } SEL.jugadorId = SEL.jugadorId === id ? null : id; V.pintar(); } },
      circuloJugador(V, id, { activo: SEL.jugadorId === id, fuera, etiquetaLibero: esLib }),
      h('span', { class: 'nom' }, nombreCorto(j.nombre)),
      h('span', { class: 'pos-act' }, esLib ? (posicion >= 0 ? `P${posicion + 1}` : 'banca') : fuera ? 'fuera' : `P${posicion + 1}`)
    );
  };
  const normales = estable.map((id) => {
    if (id == null) return null;
    if (d.esLiberoId(id)) return boton(d.reemplazados.get(id), { fuera: true });
    return boton(id);
  });
  const liberos = d.idsLibero.map((id) => boton(id, { esLib: true }));
  return h('div', { class: 'fila-circulos', 'data-scroll': 'acciones-fila' }, normales, liberos.length ? h('span', { class: 'separador-v' }) : null, liberos);
}

// Mini-estadística de la jugadora elegida: ataque y recepción (efectividad) y saque (directos y errores).
// Fila "Set" = el set en juego; fila "Partido" = todos los sets más el que va.
function miniStat(V, jugadorId, permitidos) {
  const m = miniEstadistica(V.est, jugadorId, permitidos);
  const columnas = [['ataque', 'Ataque'], ['recepcion', 'Recepción'], ['saque', 'Saque']].filter(([clave]) => m.set[clave]);
  if (!columnas.length) return null;
  const celda = (clave, c) => {
    if (!c.total) return h('td', { class: 'ms-vacio' }, '–');
    if (clave === 'saque') return h('td', {}, h('strong', {}, `${c.directos} dir.`), ` · ${c.errores} err.`, h('small', {}, ` de ${c.total}`));
    return h('td', {}, h('strong', {}, porcentaje(c.efectividad)), h('small', {}, ` de ${c.total}`));
  };
  const fila = (titulo, datos) => h('tr', {}, h('th', {}, titulo), columnas.map(([clave]) => celda(clave, datos[clave])));
  return h(
    'table',
    { class: 'mini-stat', 'aria-label': 'Mini-estadística de la jugadora' },
    h('thead', {}, h('tr', {}, h('th', {}), columnas.map(([, t]) => h('th', {}, t)))),
    h('tbody', {}, fila('Set', m.set), fila('Partido', m.partido))
  );
}

function panelJugada(V) {
  const { d } = V;
  const j = d.jugadoresPorId.get(SEL.jugadorId);
  if (!j) return h('p', { class: 'sin-seleccion' }, 'Toca una jugadora para anotar su jugada.');
  const esLib = d.esLiberoId(j.id);
  const permitidos = fundamentosPermitidos(d.jugadorEnPartido(j.id), { esLibero: esLib });
  const esBloqueo = SEL.fundamento === 'Bloqueo';
  const esColocacion = SEL.fundamento === 'Colocación';
  const registrar = (calif) => {
    const ok = V.aplicar((e, c) => registrarJugada(e, c, j.id, SEL.fundamento, calif, { bloqueoEnConjunto: esBloqueo && SEL.enConjunto, paseRecibido: esColocacion ? SEL.pase : null }));
    if (ok) limpiar();
    V.pintar();
  };
  return h(
    'div',
    { class: 'panel-jugada' },
    h(
      'div',
      {},
      h('div', { class: 'titulo-grupo' }, `${j.nombre}${esLib ? ` · ${INFO_LIBERO[d.tipoLiberoPorId.get(j.id)].nombre}` : ''}`),
      miniStat(V, j.id, permitidos),
      h('div', { class: 'grid-fund bloque-btns', style: { '--cols': permitidos.length > 4 ? 3 : 2 } }, permitidos.map((f) => h('button', { class: 'btn-fund', 'aria-pressed': String(SEL.fundamento === f), onclick: () => { SEL.fundamento = f; SEL.enConjunto = false; SEL.pase = null; V.pintar(); } }, f))),
      esColocacion ? h('div', { class: 'bloque-btns' }, h('p', { class: 'ayuda-calif' }, '¿Cómo llegó el pase? (opcional)'), h('div', { class: 'segmentos' }, [['bueno', 'Pase bueno'], ['malo', 'Pase malo']].map(([v, t]) => h('button', { 'aria-pressed': String(SEL.pase === v), onclick: () => { SEL.pase = SEL.pase === v ? null : v; V.pintar(); } }, t)))) : null,
      esBloqueo ? h('button', { class: 'check-grande', 'aria-pressed': String(SEL.enConjunto), onclick: () => { SEL.enConjunto = !SEL.enConjunto; V.pintar(); } }, h('span', { class: 'caja' }, SEL.enConjunto ? icono('ok', { tam: 18, grueso: 3 }) : null), 'Bloqueo en conjunto (solo con doble positivo)') : null
    ),
    h(
      'div',
      {},
      h('p', { class: 'ayuda-calif' }, SEL.fundamento ? `${SEL.fundamento}: ¿cómo salió?` : 'Primero elige el fundamento'),
      h('div', { class: 'grid-calif' }, CALIFICACIONES.map((c) => h('button', { class: `btn-calif calif-${c.value}`, disabled: !SEL.fundamento, onclick: () => registrar(c.value) }, c.label)))
    )
  );
}

function ultimasJugadas(V) {
  const { d, est } = V;
  const ev = est.actual.eventos.slice(-5).reverse();
  if (!ev.length) return null;
  return h(
    'div',
    {},
    h('div', { class: 'titulo-grupo' }, 'Últimas jugadas'),
    h('div', { class: 'lista-jugadas' }, ev.map((e) => h('div', {}, `${d.nombre(e.jugadorId)} · ${e.fundamento}`, h('span', { class: 'cal' }, CALIFICACIONES.find((c) => c.value === e.calificacion)?.label ?? e.calificacion)))),
    h('button', { class: 'btn btn-fantasma', style: { marginTop: '8px' }, disabled: V.bloqueado, onclick: () => V.aplicar((e) => deshacerUltimaJugada(e)) }, icono('deshacer', { tam: 18 }), ' Quitar la última jugada')
  );
}

export function vistaAcciones(V) {
  const confirmada = V.est.actual.plantillaConfirmada;
  return h(
    'div',
    { class: 'acciones', 'data-scroll': 'acciones' },
    confirmada ? filaCirculos(V) : h('p', { class: 'sin-seleccion' }, 'Confirma la plantilla en la pestaña Plantilla para anotar jugadas.'),
    confirmada ? panelJugada(V) : null,
    ultimasJugadas(V)
  );
}
