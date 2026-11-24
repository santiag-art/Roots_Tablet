// Pestaña "Resumen": estadísticas del partido para verlas en el descanso, sin pasar por Roots.
import { app, irA } from '../contexto.js';
import { nombreDeGrupo, porcentaje, resumenDePartido } from '../estadisticas.js';
import { lineaDelSet, svgLineaDelSet } from '../lineaSet.js';
import { rendimientoPorRotacion } from '../rendimientoRotacion.js';
import { normalizarNombre } from '../nuevoPartido.js';
import { resumenContraRival, resumenPuntosRivalDePartido, rivalDeRegistro } from '../puntosRival.js';
import { bloqueDetalleRival } from './puntoRival.js';
import { rutaDeRival } from './rivales.js';
import { compartirResumen, descargarResumenPdf, descargarResumenPng, prepararResumen, puedeCompartirArchivos } from '../resumenCompartir.js';
import { toast } from './aviso.js';
import { h } from './dom.js';

// Se recuerda mientras se mira el mismo partido; al cambiar de partido vuelve a "todo".
const VISTA = { partidoId: null, alcance: 'todo', abiertas: new Set(), ocupado: null, vistaPrevia: null, rivalTodos: false };

function sincronizar(V) {
  if (VISTA.partidoId !== V.reg.id) Object.assign(VISTA, { partidoId: V.reg.id, alcance: 'todo', abiertas: new Set(), ocupado: null, vistaPrevia: null, rivalTodos: false });
}

const celdas = (c) => [h('td', { class: 'c-tot' }, c.total), h('td', { class: 'c-dp' }, c.doble_positivo), h('td', { class: 'c-p' }, c.positivo), h('td', { class: 'c-n' }, c.negativo), h('td', { class: 'c-e' }, c.error), h('td', { class: 'c-ef' }, porcentaje(c.efectividad))];

const encabezado = (primera) => h('thead', {}, h('tr', {}, h('th', {}, primera), ['Jugadas', '++', '+', '−', 'Err', 'Efect.'].map((t) => h('th', {}, t))));

function tarjetaMarcador(V, resumen) {
  const { d, nombres } = V;
  return h(
    'div',
    { class: 'tarjeta resumen-marcador' },
    h('div', { class: 'rm-equipos' }, h('strong', {}, nombres.local), h('span', { class: 'rm-sets' }, `${d.setsLocal} - ${d.setsVisitante}`), h('strong', {}, nombres.visitante)),
    resumen.sets.length
      ? h(
          'div',
          { class: 'rm-lista' },
          resumen.sets.map((s) =>
            h(
              'div',
              { class: `rm-set ${s.enJuego ? 'en-juego' : ''}` },
              h('span', { class: 'rm-n' }, s.enJuego ? `Set ${s.numeroSet} · en juego` : `Set ${s.numeroSet}`),
              h('span', { class: 'rm-pts' }, `${s.puntosLocal} - ${s.puntosVisitante}`),
              h('span', { class: 'rm-det' }, `TM ${s.tiemposMuertos.local}-${s.tiemposMuertos.visitante} · cambios ${s.cambios}`)
            )
          )
        )
      : h('p', { class: 'nota' }, 'Todavía no hay puntos anotados.')
  );
}

function selectorAlcance(V, resumen, pintar) {
  const opciones = [['todo', 'Todo el partido'], ...resumen.sets.map((s) => [s.clave, s.enJuego ? `Set ${s.numeroSet} (en juego)` : `Set ${s.numeroSet}`])];
  return h('div', { class: 'segmentos resumen-alcance', role: 'group', 'aria-label': 'Qué parte del partido ver' }, opciones.map(([valor, texto]) => h('button', { 'aria-pressed': String(VISTA.alcance === valor), onclick: () => { VISTA.alcance = valor; pintar(); } }, texto)));
}

function tablaEquipo(resumen) {
  return h(
    'div',
    { class: 'tarjeta' },
    h('div', { class: 'titulo-grupo' }, 'Equipo por fundamento'),
    h('table', { class: 'tabla-stats' }, encabezado('Fundamento'), h('tbody', {}, [...resumen.fundamentos.map((f) => h('tr', {}, h('td', {}, f.fundamento), celdas(f))), h('tr', { class: 'fila-total' }, h('td', {}, 'Total'), celdas(resumen.equipo))]))
  );
}

// Línea del set: diferencia de puntos punto a punto (arriba del cero vamos ganando). Con "Todo el partido" va una por set.
function tarjetaLinea(V, alcance) {
  const { est, nombres } = V;
  const propio = est.ladoPropio;
  const sets = [
    ...est.sets.map((x) => ({ clave: x.numeroSet, titulo: `Set ${x.numeroSet}`, seq: x.puntosSeq ?? [], total: x.puntosLocal + x.puntosVisitante, marcador: `${x.puntosLocal}-${x.puntosVisitante}` })),
    { clave: 'actual', titulo: `Set ${est.sets.length + 1} · en juego`, seq: est.actual.puntosSeq ?? [], total: est.actual.puntosLocal + est.actual.puntosVisitante, marcador: `${est.actual.puntosLocal}-${est.actual.puntosVisitante}` },
  ].filter((x) => (alcance === 'todo' ? x.total > 0 : x.clave === alcance));
  const marca = ([a, b]) => `${a}-${b}`;
  const bloque = (x) => {
    const linea = lineaDelSet(x.seq, propio);
    const cabeza = h('div', { class: 'ls-titulo' }, h('strong', {}, x.titulo), h('span', {}, x.marcador));
    if (!linea.n) return h('div', { class: 'ls-set' }, cabeza, h('p', { class: 'nota' }, 'Este set no tiene los puntos anotados uno a uno (se anotó con una versión anterior o se cerró sin sumar los puntos).'));
    const datos = [];
    if (linea.desventaja) datos.push(h('li', {}, 'Mayor desventaja: ', h('strong', {}, `−${Math.abs(linea.desventaja.valor)}`), ` (${marca(linea.desventaja.marcador)})`));
    else datos.push(h('li', {}, 'Nunca fuimos perdiendo.'));
    if (linea.ventaja) datos.push(h('li', {}, 'Mayor ventaja: ', h('strong', {}, `+${linea.ventaja.valor}`), ` (${marca(linea.ventaja.marcador)})`));
    else datos.push(h('li', {}, 'Nunca fuimos ganando.'));
    if (linea.rachaRival && linea.rachaRival.largo >= 2) datos.push(h('li', {}, 'Peor racha del rival: ', h('strong', {}, `${linea.rachaRival.largo} puntos`), ` (de ${marca(linea.marcador[linea.rachaRival.desde])} a ${marca(linea.marcador[linea.rachaRival.hasta])})`));
    if (linea.rachaPropia && linea.rachaPropia.largo >= 2) datos.push(h('li', {}, 'Mejor racha nuestra: ', h('strong', {}, `${linea.rachaPropia.largo} puntos`), ` (de ${marca(linea.marcador[linea.rachaPropia.desde])} a ${marca(linea.marcador[linea.rachaPropia.hasta])})`));
    const grafica = h('div', { class: 'ls-grafica' });
    grafica.innerHTML = svgLineaDelSet(linea, { id: `ls-${String(x.clave)}` });
    const incompleto = linea.n < x.total ? h('p', { class: 'nota' }, `Solo ${linea.n} de los ${x.total} puntos del set están anotados uno a uno, así que la línea queda incompleta.`) : null;
    return h('div', { class: 'ls-set' }, cabeza, grafica, h('ul', { class: 'ls-datos' }, datos), incompleto);
  };
  return h(
    'div',
    { class: 'tarjeta' },
    h('div', { class: 'titulo-grupo' }, 'Línea del set'),
    sets.length ? sets.map(bloque) : h('p', { class: 'nota' }, 'Aún no hay puntos anotados en esta parte del partido.'),
    sets.length ? h('p', { class: 'nota' }, `Cada punto de la línea es la diferencia de ${nombres[propio]} contra el rival: arriba del cero vamos ganando, abajo perdiendo. El tramo rojo es la peor racha del rival (de 3 puntos o más). Los marcadores van como ${nombres[propio]}-rival.`) : null
  );
}

// Rendimiento por rotación: puntos ganados y perdidos, saque, side-out (puntos ganados al recibir) y recepción.
function tablaRotaciones(V, alcance) {
  const r = rendimientoPorRotacion(V.est, alcance);
  const pct = (x) => porcentaje(x.porcentaje ?? null);
  const fila = (f) =>
    h(
      'tr',
      { class: [r.masDebil === f.rotacion ? 'fila-debil' : '', r.peorRecepcion === f.rotacion ? 'fila-recibe-peor' : ''].join(' ').trim() },
      h('td', {}, `R${f.rotacion}`, r.masDebil === f.rotacion ? h('span', { class: 'marca-debil', title: 'Donde más puntos se pierden' }, ' ▼') : null),
      h('td', { class: 'c-tot' }, f.total ? `${f.ganados}-${f.perdidos}` : '–'),
      h('td', { class: f.diferencia < 0 ? 'c-e' : f.diferencia > 0 ? 'c-dp' : '' }, f.total ? (f.diferencia > 0 ? `+${f.diferencia}` : String(f.diferencia)) : '–'),
      h('td', {}, pct(f.saque)),
      h('td', {}, pct(f.sideOut)),
      h('td', { class: r.peorRecepcion === f.rotacion ? 'c-e' : '' }, f.recepcion.total ? `${porcentaje(f.recepcion.efectividad)} (${f.recepcion.total})` : '–')
    );
  const peor = r.masDebil ? `Donde más puntos se pierden: R${r.masDebil}. ` : '';
  const recibe = r.peorRecepcion ? `La que peor recibe: R${r.peorRecepcion}.` : '';
  return h(
    'div',
    { class: 'tarjeta' },
    h('div', { class: 'titulo-grupo' }, 'Rendimiento por rotación'),
    r.hayDatos
      ? h('table', { class: 'tabla-stats tabla-rotaciones' }, h('thead', {}, h('tr', {}, ['Rot.', 'Puntos', 'Dif.', 'Saque', 'Side-out', 'Recepción'].map((t) => h('th', {}, t)))), h('tbody', {}, r.filas.map(fila)))
      : h('p', { class: 'nota' }, 'Aún no hay puntos con rotación en esta parte del partido. Se llena al anotar con la plantilla confirmada.'),
    r.hayDatos ? h('p', { class: 'nota' }, `${peor}${recibe} R1 es la formación con que empieza el set y cada vez que se recupera el saque pasa a la siguiente. Puntos = ganados-perdidos en esa rotación. Saque = puntos ganados cuando sacamos. Side-out = puntos ganados cuando el rival saca. Recepción = efectividad (cantidad).`.trim()) : null,
    r.sinRotacion > 0 ? h('p', { class: 'nota' }, `${r.sinRotacion} punto${r.sinRotacion > 1 ? 's' : ''} sin rotación (anotados antes de confirmar la plantilla o en una versión anterior de la app) no se cuentan aquí.`) : null
  );
}

// Cómo anota el rival: motivo de sus puntos y, en los ataques, de dónde salen y dónde caen. Para preparar la defensa.
// "Todos los partidos" junta los partidos guardados en la tablet contra el mismo rival.
function tarjetaRival(V, alcance, pintar) {
  const rival = rivalDeRegistro(V.reg);
  const contra = resumenContraRival([...app.partidos.values()], rival, normalizarNombre);
  const todos = VISTA.rivalTodos;
  const r = todos ? contra.resumen : resumenPuntosRivalDePartido(V.est, alcance);
  const segmentos = h(
    'div',
    { class: 'segmentos', role: 'group', 'aria-label': 'Qué partidos del rival ver' },
    [[false, 'Este partido'], [true, `Todos vs ${rival}${contra.partidos > 1 ? ` (${contra.partidos})` : ''}`]].map(([valor, texto]) => h('button', { 'aria-pressed': String(todos === valor), onclick: () => { VISTA.rivalTodos = valor; pintar(); } }, texto))
  );
  const cabeza = [h('div', { class: 'titulo-grupo' }, `Cómo anota ${rival}`), segmentos, h('button', { class: 'btn btn-fantasma', 'data-ver-historial': '', onclick: () => irA(rutaDeRival(normalizarNombre(rival))) }, `Ver historial de ${rival}`)];
  if (r.total === 0) return h('div', { class: 'tarjeta tarjeta-rival', 'data-tarjeta-rival': '' }, cabeza, h('p', { class: 'nota' }, 'Todavía no hay puntos del rival en esta parte del partido.'));
  return h('div', { class: 'tarjeta tarjeta-rival', 'data-tarjeta-rival': '' }, cabeza, bloqueDetalleRival(r, rival));
}

function tablaJugadoras(resumen, pintar) {
  const filas = [];
  let grupo = null;
  for (const j of resumen.jugadoras) {
    if (j.grupo !== grupo) {
      grupo = j.grupo;
      filas.push(h('tr', { class: 'fila-grupo' }, h('td', { colspan: 7 }, nombreDeGrupo(grupo))));
    }
    const abierta = VISTA.abiertas.has(j.id);
    filas.push(
      h(
        'tr',
        { class: 'fila-jugadora' },
        h('td', {}, h('button', { class: 'btn-fila', 'aria-expanded': String(abierta), onclick: () => { if (abierta) VISTA.abiertas.delete(j.id); else VISTA.abiertas.add(j.id); pintar(); } }, h('span', { class: 'flecha' }, abierta ? '▾' : '▸'), j.numero != null ? h('span', { class: 'num-j' }, j.numero) : null, j.nombre)),
        celdas(j)
      )
    );
    if (abierta) j.fundamentos.forEach((f) => filas.push(h('tr', { class: 'fila-detalle' }, h('td', {}, f.fundamento), celdas(f))));
  }
  return h(
    'div',
    { class: 'tarjeta' },
    h('div', { class: 'titulo-grupo' }, 'Por jugadora'),
    resumen.jugadoras.length ? h('table', { class: 'tabla-stats tabla-jugadoras' }, encabezado('Jugadora'), h('tbody', {}, filas)) : h('p', { class: 'nota' }, 'Aún no hay jugadas anotadas en esta parte del partido.'),
    resumen.jugadoras.length ? h('p', { class: 'nota' }, 'Toca una jugadora para ver sus fundamentos. Efect. = (++ y +) sobre el total de jugadas.') : null
  );
}

// Resumen para compartir (el mismo de Roots): marcador por sets, mejores jugadoras y puntos clave, para mandar por WhatsApp.
// Usa solo los sets ya guardados, igual que Roots.
function tarjetaCompartir(V) {
  const { est, reg } = V;
  const hayRegistro = est.sets.length > 0;
  const puedeCompartir = puedeCompartirArchivos();
  const ejecutar = async (accion, trabajo, avisoOk) => {
    if (VISTA.ocupado) return;
    const partidoId = V.reg.id;
    VISTA.ocupado = accion;
    V.pintar();
    try {
      const resumen = await prepararResumen({ registro: reg, torneo: app.torneos.get(reg.torneoId), jugadores: V.jugadores });
      await trabajo(resumen);
      if (avisoOk) toast(avisoOk, 'ok', 4000);
    } catch (err) {
      if (err?.name !== 'AbortError') toast(err?.message || 'No se pudo generar el resumen.', 'error'); // AbortError = cerró el menú de compartir
    } finally {
      if (VISTA.partidoId === partidoId) VISTA.ocupado = null;
      V.pintar();
    }
  };
  const vista = () =>
    VISTA.vistaPrevia
      ? (() => { VISTA.vistaPrevia = null; V.pintar(); })()
      : ejecutar('vista', async (r) => { VISTA.vistaPrevia = r.canvas.toDataURL('image/png'); });
  const texto = (accion, normal, ocupado) => (VISTA.ocupado === accion ? ocupado : normal);
  const bloqueo = !hayRegistro || Boolean(VISTA.ocupado);
  return h(
    'div',
    { class: 'tarjeta resumen-compartir' },
    h('div', { class: 'titulo-grupo' }, 'Resumen para compartir'),
    h('p', { class: 'nota' }, hayRegistro ? 'Marcador por sets, mejores jugadoras y puntos clave, listo para mandar a las familias por WhatsApp.' : 'Guarda al menos un set para poder generar el resumen.'),
    h(
      'div',
      { class: 'resumen-compartir-botones', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      puedeCompartir ? h('button', { class: 'btn btn-primario', disabled: bloqueo, onclick: () => ejecutar('compartir', compartirResumen) }, texto('compartir', 'Compartir…', 'Abriendo…')) : null,
      h('button', { class: `btn ${puedeCompartir ? '' : 'btn-primario'}`, disabled: bloqueo, onclick: () => ejecutar('pdf', descargarResumenPdf, 'PDF descargado. Ya puedes enviarlo por WhatsApp.') }, texto('pdf', 'Descargar PDF', 'Generando…')),
      h('button', { class: 'btn', disabled: bloqueo, onclick: () => ejecutar('png', descargarResumenPng, 'Imagen descargada. Ya puedes enviarla por WhatsApp.') }, texto('png', 'Descargar imagen', 'Generando…')),
      h('button', { class: 'btn btn-fantasma', disabled: bloqueo, onclick: vista }, texto('vista', VISTA.vistaPrevia ? 'Ocultar vista previa' : 'Ver vista previa', 'Generando…'))
    ),
    VISTA.vistaPrevia ? h('img', { class: 'resumen-vista-previa', src: VISTA.vistaPrevia, alt: 'Vista previa del resumen del partido', style: { display: 'block', width: '100%', maxWidth: '420px', margin: '14px auto 0', borderRadius: '14px', border: '1px solid var(--borde, #cbd5e1)' } }) : null
  );
}

export function vistaResumen(V) {
  sincronizar(V);
  const resumenBase = resumenDePartido(V.est, V.d.jugadoresPorId, 'todo');
  // Si el set elegido ya no existe (por ejemplo, se reabrió), se vuelve a "todo".
  if (VISTA.alcance !== 'todo' && !resumenBase.sets.some((s) => s.clave === VISTA.alcance)) VISTA.alcance = 'todo';
  const resumen = VISTA.alcance === 'todo' ? resumenBase : resumenDePartido(V.est, V.d.jugadoresPorId, VISTA.alcance);
  const pintar = () => V.pintar();
  return h('div', { class: 'resumen', 'data-scroll': 'resumen' }, tarjetaMarcador(V, resumenBase), tarjetaCompartir(V), selectorAlcance(V, resumenBase, pintar), tarjetaLinea(V, VISTA.alcance), tablaEquipo(resumen), tablaRotaciones(V, VISTA.alcance), tarjetaRival(V, VISTA.alcance, pintar), tablaJugadoras(resumen, pintar));
}
