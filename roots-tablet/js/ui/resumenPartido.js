// Pestaña "Resumen": estadísticas del partido para verlas en el descanso, sin pasar por Roots.
import { app } from '../contexto.js';
import { nombreDeGrupo, porcentaje, resumenDePartido } from '../estadisticas.js';
import { compartirResumen, descargarResumenPdf, descargarResumenPng, prepararResumen, puedeCompartirArchivos } from '../resumenCompartir.js';
import { toast } from './aviso.js';
import { h } from './dom.js';

// Se recuerda mientras se mira el mismo partido; al cambiar de partido vuelve a "todo".
const VISTA = { partidoId: null, alcance: 'todo', abiertas: new Set(), ocupado: null, vistaPrevia: null };

function sincronizar(V) {
  if (VISTA.partidoId !== V.reg.id) Object.assign(VISTA, { partidoId: V.reg.id, alcance: 'todo', abiertas: new Set(), ocupado: null, vistaPrevia: null });
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
  return h('div', { class: 'resumen', 'data-scroll': 'resumen' }, tarjetaMarcador(V, resumenBase), tarjetaCompartir(V), selectorAlcance(V, resumenBase, pintar), tablaEquipo(resumen), tablaJugadoras(resumen, pintar));
}
