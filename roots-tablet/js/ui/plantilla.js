// Pestaña "Plantilla": cancha, rotación, líberos y banca.
import {
  MAX_SUSTITUCIONES, alineadosNoAptos, cambiarModoLibero, colocarComoLibero, colocarEnPosicion, confirmarPlantilla, designarNuevoLibero, devolverABanca,
  editarPlantilla, ejecutarSustitucion, entrarLibero, quitarLibero, rotarAMano, rotarCancha, salirLibero, toggleJugador,
} from '../motor.js';
import { app } from '../contexto.js';
import { avisoFaltaDePosicion, revisarFormacion } from '../reglas/faltaPosicion.js';
import { INFO_LIBERO } from '../reglas/liberos.js';
import { FILAS_CANCHA, nombrePosicion, todasLasRotaciones } from '../reglas/rotaciones.js';
import { abrirVentana, confirmar } from './aviso.js';
import { h, icono, nombreCorto, rellenar } from './dom.js';
import { circuloJugador, circuloVacio, insigniaDisponibilidad, opcionJugador, subtituloJugador } from './piezas.js';

const INDICES_ZAGUERA = [0, 4, 5];
let filtroCategoria = null;

// ─────────────── Cancha ───────────────
function casilla(V, indice) {
  const { d, est } = V;
  const act = est.actual;
  const id = act.slots[indice];
  const posicion = indice + 1;
  const saca = posicion === 1 && d.sacamos === true;
  return h(
    'button',
    { class: 'casilla', 'aria-label': `P${posicion}${id != null ? `, ${d.nombre(id)}` : ', vacía'}`, onclick: () => (act.plantillaConfirmada ? abrirCasillaEnJuego(V, indice) : abrirCasillaArmado(V, indice)) },
    h('span', { class: `pos ${saca ? 'saque' : ''}` }, `P${posicion}`),
    id != null ? circuloJugador(V, id) : circuloVacio(),
    id != null ? h('span', { class: 'nombre-pill' }, nombreCorto(d.nombre(id))) : null
  );
}

function cancha(V) {
  const orden = FILAS_CANCHA.flatMap((f) => f.posiciones.map((p) => p - 1));
  return h('div', { class: 'cancha', style: { backgroundImage: 'url(img/cancha-roots.jpg)' }, role: 'group', 'aria-label': 'Cancha' }, h('div', { class: 'cancha-zona' }, orden.map((i) => casilla(V, i))));
}

// ─────────────── Armado de la plantilla ───────────────
function abrirCasillaArmado(V, indice) {
  if (V.bloqueado) return V.avisoBloqueado();
  const { d, est } = V;
  const ocupante = est.actual.slots[indice];
  const candidatos = V.jugadores.filter((j) => j.id !== ocupante && !d.inhabilitadosLibero.has(j.id));
  const dePlantilla = (id) => (est.actual.slots.includes(id) ? `En P${est.actual.slots.indexOf(id) + 1}` : d.tipoLiberoPorId.has(id) ? INFO_LIBERO[d.tipoLiberoPorId.get(id)].nombre : '');
  abrirVentana({
    titulo: `P${indice + 1} · ${nombrePosicion(indice + 1)}`,
    subtitulo: ocupante != null ? `Ahora: ${d.nombre(ocupante)}` : 'Elige quién juega aquí',
    ancho: 'media',
    contenido: (cerrar) =>
      h(
        'div',
        { class: 'lista-opciones' },
        ocupante != null ? h('button', { class: 'opcion peligro', onclick: () => { V.aplicar((e, c) => devolverABanca(e, c, ocupante)); cerrar(); } }, icono('cerrar'), h('span', { class: 'datos' }, h('strong', {}, 'Quitar de la cancha'))) : null,
        candidatos.map((j) => opcionJugador(V, j.id, { nota: dePlantilla(j.id), onclick: () => { V.aplicar((e, c) => colocarEnPosicion(e, c, j.id, indice)); cerrar(); } }))
      ),
  });
}

function abrirCupoLibero(V, clave) {
  if (V.bloqueado) return V.avisoBloqueado();
  const { d, est } = V;
  const actual = est.actual.liberos[clave];
  abrirVentana({
    titulo: INFO_LIBERO[clave].nombre,
    subtitulo: 'Elige quién será el líbero de este set',
    contenido: (cerrar) =>
      h(
        'div',
        { class: 'lista-opciones' },
        V.jugadores.filter((j) => j.id !== actual && !d.inhabilitadosLibero.has(j.id)).map((j) =>
          opcionJugador(V, j.id, { nota: est.actual.slots.includes(j.id) ? `En P${est.actual.slots.indexOf(j.id) + 1}` : '', onclick: () => { V.aplicar((e, c) => colocarComoLibero(e, c, j.id, clave)); cerrar(); } })
        )
      ),
  });
}

async function confirmar_(V) {
  const { est } = V;
  const noAptos = alineadosNoAptos(est, V.ctx);
  if (noAptos.length) {
    const ok = await confirmar({ titulo: 'Jugadoras no aptas', texto: `Roots las marca como NO aptas: ${noAptos.map((j) => j.nombre).join(', ')}. ¿Las dejas en la plantilla de todos modos?`, si: 'Sí, dejarlas', no: 'Volver', peligro: true });
    if (!ok) return;
  }
  V.aplicar((e, c) => confirmarPlantilla(e, c));
}

// ─────────────── En juego ───────────────
function abrirCasillaEnJuego(V, indice) {
  if (V.bloqueado) return V.avisoBloqueado();
  const { d, est } = V;
  const act = est.actual;
  const id = act.slots[indice];
  if (id == null) return;
  const esLib = d.esLiberoId(id);
  const liberosFuera = d.idsLibero.filter((l) => !act.slots.includes(l));
  const filas = [];
  if (esLib) {
    filas.push(h('button', { class: 'opcion principal', onclick: () => { V.aplicar((e, c) => salirLibero(e, c, id)); v.cerrar(); } }, icono('bajar'), h('span', { class: 'datos' }, h('strong', {}, `Sale ${nombreCorto(d.nombre(id))}`), h('small', {}, `Vuelve ${nombreCorto(d.nombre(d.reemplazados.get(id)))}`))));
    liberosFuera.forEach((l) => filas.push(h('button', { class: 'opcion', onclick: () => { V.aplicar((e, c) => entrarLibero(e, c, l, id)); v.cerrar(); } }, circuloJugador(V, l), h('span', { class: 'datos' }, h('strong', {}, `Entra ${nombreCorto(d.nombre(l))} por ${nombreCorto(d.nombre(id))}`)))));
    filas.push(h('button', { class: 'opcion peligro', onclick: () => { v.cerrar(); abrirNuevoLibero(V, id); } }, icono('alerta'), h('span', { class: 'datos' }, h('strong', {}, 'No puede seguir (nuevo líbero)'))));
  } else {
    if (INDICES_ZAGUERA.includes(indice)) {
      liberosFuera.forEach((l) => filas.push(h('button', { class: 'opcion principal', onclick: () => { V.aplicar((e, c) => entrarLibero(e, c, l, id)); v.cerrar(); } }, circuloJugador(V, l), h('span', { class: 'datos' }, h('strong', {}, `Entra ${nombreCorto(d.nombre(l))} por ${nombreCorto(d.nombre(id))}`), h('small', {}, 'No cuenta como cambio')))));
    }
    filas.push(h('button', { class: 'opcion', onclick: () => { v.cerrar(); abrirCambio(V, id); } }, icono('rotar'), h('span', { class: 'datos' }, h('strong', {}, 'Hacer un cambio'), h('small', {}, `${d.sustitucionesUsadas}/${MAX_SUSTITUCIONES} usados en este set`))));
  }
  const v = abrirVentana({ titulo: `P${indice + 1} · ${d.nombre(id)}`, subtitulo: nombrePosicion(indice + 1), contenido: h('div', { class: 'lista-opciones' }, filas), ancho: 'media' });
}

function abrirCambio(V, saleId, { entraPreelegido = null } = {}) {
  const { d } = V;
  let excepcional = false;
  const entran = d.jugadoresBanca.filter((j) => !d.esLiberoId(j.id));
  const cuerpo = h('div', { class: 'lista-opciones' });
  const pintar = (cerrar) => {
    rellenar(cuerpo, 
      h('button', { class: 'check-grande', 'aria-pressed': String(excepcional), onclick: () => { excepcional = !excepcional; pintar(cerrar); } }, h('span', { class: 'caja' }, excepcional ? icono('ok', { tam: 18, grueso: 3 }) : null), 'Cambio excepcional (lesión)'),
      entran.map((j) => opcionJugador(V, j.id, { nota: d.salieronExcepcionalIds.has(j.id) ? 'Salió por excepción' : '', principal: j.id === entraPreelegido, onclick: () => { if (V.aplicar((e, c) => ejecutarSustitucion(e, c, saleId, j.id, { excepcional }))) cerrar(); } }))
    );
  };
  abrirVentana({ titulo: `Sale ${d.nombre(saleId)}`, subtitulo: `¿Quién entra? · cambios ${d.sustitucionesUsadas}/${MAX_SUSTITUCIONES}`, contenido: (cerrar) => { pintar(cerrar); return cuerpo; } });
}

function abrirNuevoLibero(V, lesionadoId) {
  const { d } = V;
  abrirVentana({
    titulo: 'Nuevo líbero (regla 19.4)',
    subtitulo: `${d.nombre(lesionadoId)} no puede seguir. ¿Quién será líbero el resto del partido?`,
    contenido: (cerrar) => h('div', { class: 'lista-opciones' }, d.candidatasNuevoLibero.map((j) => opcionJugador(V, j.id, { onclick: () => { V.aplicar((e, c) => designarNuevoLibero(e, c, lesionadoId, j.id)); cerrar(); } }))),
  });
}

function abrirEntrarLibero(V, liberoId) {
  const { d, est } = V;
  const candidatas = INDICES_ZAGUERA.map((i) => [i, est.actual.slots[i]]).filter(([, id]) => id != null && !d.esLiberoId(id));
  abrirVentana({
    titulo: `Entra ${d.nombre(liberoId)}`,
    subtitulo: '¿Por quién? Solo zagueras (P1, P5, P6)',
    contenido: (cerrar) => h('div', { class: 'lista-opciones' }, candidatas.map(([i, id]) => opcionJugador(V, id, { nota: `P${i + 1}`, onclick: () => { V.aplicar((e, c) => entrarLibero(e, c, liberoId, id)); cerrar(); } }))),
  });
}

function abrirRotaciones(V) {
  const { d, est } = V;
  const base = est.actual.slots.map((id) => d.reemplazados.get(id) ?? id);
  abrirVentana({
    titulo: 'Las 6 rotaciones',
    subtitulo: 'La actual está resaltada',
    ancho: 'grande',
    contenido: h(
      'div',
      { class: 'mini-rotaciones' },
      todasLasRotaciones(base).map((r, k) =>
        h('div', { class: `mini-rot ${k === 0 ? 'actual' : ''}` }, h('h4', {}, k === 0 ? 'Ahora' : `Dentro de ${k} rotación${k > 1 ? 'es' : ''}`), h('div', { class: 'rejilla' }, FILAS_CANCHA.flatMap((f) => f.posiciones.map((p) => h('span', { title: d.nombre(r[p - 1]) }, nombreCorto(d.nombre(r[p - 1])).slice(0, 5))))))
      )
    ),
  });
}

function abrirVerificacion(V) {
  const { d, est } = V;
  const esperada = est.actual.slots.map((id) => d.reemplazados.get(id) ?? id);
  const declarada = [...esperada];
  const resultado = h('div', {});
  const campos = FILAS_CANCHA.flatMap((f) => f.posiciones).map((p) => {
    const sel = h('select', { class: 'selector', 'aria-label': `Quién está en P${p}`, onchange: () => { declarada[p - 1] = sel.value === '' ? null : Number(sel.value); } },
      h('option', { value: '' }, '— nadie —'),
      esperada.filter(Boolean).map((id) => h('option', { value: id, selected: declarada[p - 1] === id }, d.nombre(id))));
    return h('label', {}, `P${p}`, sel);
  });
  abrirVentana({
    titulo: 'Verificar la formación',
    subtitulo: 'Pon quién está de verdad en cada posición y comparo con la rotación',
    ancho: 'grande',
    contenido: h('div', {}, h('div', { class: 'formacion-grid' }, campos), resultado),
    acciones: [
      { texto: 'Cerrar', cerrar: true },
      {
        texto: 'Revisar',
        tipo: 'primario',
        cerrar: false,
        onclick: () => {
          const r = revisarFormacion({ esperada, declarada });
          resultado.replaceChildren(r.correcta ? h('p', { class: 'ok-linea' }, 'La formación coincide con la rotación.') : h('p', { class: 'error-linea' }, avisoFaltaDePosicion(r, d.nombre)));
        },
      },
    ],
  });
}

function controlesEnJuego(V) {
  const { d, est } = V;
  const act = est.actual;
  const p1 = act.slots[0];
  return h(
    'div',
    { class: 'controles-cancha' },
    h(
      'div',
      { class: 'rotacion' },
      h('button', { class: 'btn-icono', 'aria-label': 'Rotar hacia atrás', disabled: V.bloqueado, onclick: () => V.aplicar((e, c) => rotarCancha(e, c, -1)) }, icono('deshacer')),
      h('div', { class: 'centro' }, h('strong', {}, `Rotación ${act.rotaciones + 1} de 6`), h('span', {}, p1 != null ? `Saca ${d.nombre(p1)} (P1)` : '')),
      h('button', { class: 'btn btn-primario', disabled: V.bloqueado, onclick: () => V.aplicar((e, c) => rotarAMano(e, c, 1)) }, icono('rotar', { tam: 20 }), ' Rotar')
    ),
    h('div', { class: 'botones', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn', onclick: () => abrirRotaciones(V) }, 'Ver rotaciones'),
      h('button', { class: 'btn', onclick: () => abrirVerificacion(V) }, 'Verificar formación'),
      h('button', { class: 'btn', disabled: V.bloqueado, onclick: () => V.aplicar((e, c) => editarPlantilla(e, c)) }, 'Editar plantilla'))
  );
}

function controlesArmado(V) {
  const { d } = V;
  if (V.bloqueado) return h('p', { class: 'nota' }, 'Partido terminado: no hay set en juego.');
  const faltan = 6 - d.enCancha.length;
  return h(
    'div',
    { class: 'controles-cancha' },
    h('p', { class: 'nota' }, faltan > 0 ? `Toca una casilla o una jugadora de la banca. Faltan ${faltan} en cancha.` : d.plantillaCompleta ? 'Todo listo. Confirma la plantilla para empezar.' : 'Falta elegir al líbero.'),
    h('button', { class: 'btn btn-primario btn-grande btn-ancho', disabled: V.bloqueado, onclick: () => confirmar_(V) }, icono('ok'), ' Confirmar plantilla')
  );
}

// ─────────────── Columna derecha ───────────────
function cupoLibero(V, clave) {
  const { d, est } = V;
  const act = est.actual;
  const id = act.liberos[clave];
  const enCancha = id != null && act.slots.includes(id);
  const botones = [];
  if (!act.plantillaConfirmada) {
    botones.push(h('button', { class: 'btn', disabled: V.bloqueado, onclick: () => abrirCupoLibero(V, clave) }, id != null ? 'Cambiar' : 'Elegir'));
    if (id != null) botones.push(h('button', { class: 'btn btn-fantasma', disabled: V.bloqueado, onclick: () => V.aplicar((e) => quitarLibero(e, clave)) }, 'Quitar'));
  } else if (id != null) {
    botones.push(enCancha ? h('button', { class: 'btn', disabled: V.bloqueado, onclick: () => V.aplicar((e, c) => salirLibero(e, c, id)) }, 'Salir') : h('button', { class: 'btn btn-primario', disabled: V.bloqueado, onclick: () => abrirEntrarLibero(V, id) }, 'Entrar'));
    botones.push(h('button', { class: 'btn btn-fantasma', disabled: V.bloqueado, onclick: () => abrirNuevoLibero(V, id) }, 'No puede seguir'));
  }
  return h(
    'div',
    { class: `cupo lib-${clave}` },
    id != null ? circuloJugador(V, id, { etiquetaLibero: false }) : circuloVacio('?'),
    h('div', { class: 'quien' }, h('strong', {}, INFO_LIBERO[clave].nombre), h('span', {}, id != null ? `${d.nombre(id)}${act.plantillaConfirmada ? (enCancha ? ' · en cancha' : ' · en banca') : ''}` : 'Sin elegir')),
    h('div', { class: 'botones' }, botones)
  );
}

function bancaLista(V) {
  const { d, est } = V;
  const act = est.actual;
  const categorias = [...new Set(V.jugadores.map((j) => j.categoria).filter(Boolean))];
  if (filtroCategoria && !categorias.includes(filtroCategoria)) filtroCategoria = null;
  const lista = V.jugadores.filter((j) => !filtroCategoria || j.categoria === filtroCategoria);
  return h(
    'div',
    {},
    h('div', { class: 'titulo-grupo' }, act.plantillaConfirmada ? 'Banca (toca para hacer un cambio)' : 'Jugadoras (toca para ponerla en cancha)'),
    categorias.length > 1
      ? h('div', { class: 'chips-categoria' }, [null, ...categorias].map((c) => h('button', { class: `chip ${filtroCategoria === c ? 'activo' : ''}`, 'aria-pressed': String(filtroCategoria === c), onclick: () => { filtroCategoria = c; app.renderizar(); } }, c ?? 'Todas')))
      : null,
    lista.map((j) => {
      const enCancha = act.slots.includes(j.id);
      const esLib = d.esLiberoId(j.id);
      const fuera = d.reemplazadosIds.has(j.id);
      const inhab = d.inhabilitadosLibero.has(j.id);
      let nota = '';
      if (enCancha) nota = `En P${act.slots.indexOf(j.id) + 1}`;
      else if (esLib) nota = INFO_LIBERO[d.tipoLiberoPorId.get(j.id)].nombre;
      else if (fuera) nota = 'Fuera por el líbero';
      else if (inhab) nota = 'No puede volver (era líbero)';
      return h(
        'button',
        {
          class: `fila-jugador ${enCancha || esLib ? 'en-cancha' : ''}`,
          disabled: V.bloqueado || esLib || fuera || inhab,
          onclick: () => {
            if (!act.plantillaConfirmada) V.aplicar((e, c) => toggleJugador(e, c, j.id));
            else if (!enCancha) abrirQuienSale(V, j.id);
          },
        },
        circuloJugador(V, j.id, { etiquetaLibero: false }),
        h('span', { class: 'datos' }, h('strong', {}, h('span', { class: 'nom' }, j.nombre), insigniaDisponibilidad(j.id)), h('small', {}, [subtituloJugador(j), nota].filter(Boolean).join(' · ')))
      );
    })
  );
}

function abrirQuienSale(V, entraId) {
  const { d, est } = V;
  const sale = est.actual.slots.filter((id) => id != null && !d.esLiberoId(id));
  let excepcional = false;
  const cuerpo = h('div', { class: 'lista-opciones' });
  const pintar = (cerrar) =>
    rellenar(cuerpo, 
      h('button', { class: 'check-grande', 'aria-pressed': String(excepcional), onclick: () => { excepcional = !excepcional; pintar(cerrar); } }, h('span', { class: 'caja' }, excepcional ? icono('ok', { tam: 18, grueso: 3 }) : null), 'Cambio excepcional (lesión)'),
      sale.map((id) => opcionJugador(V, id, { nota: `P${est.actual.slots.indexOf(id) + 1}`, onclick: () => { if (V.aplicar((e, c) => ejecutarSustitucion(e, c, id, entraId, { excepcional }))) cerrar(); } }))
    );
  abrirVentana({ titulo: `Entra ${d.nombre(entraId)}`, subtitulo: `¿Por quién? · cambios ${d.sustitucionesUsadas}/${MAX_SUSTITUCIONES}`, contenido: (cerrar) => { pintar(cerrar); return cuerpo; } });
}

function modoLibero(V) {
  const act = V.est.actual;
  const modos = [['ninguno', 'Sin líbero'], ['uno', 'Un líbero'], ['dos', 'Dos líberos']];
  return h('div', { class: 'modo-libero' }, h('div', { class: 'titulo-grupo' }, 'Líberos'), act.plantillaConfirmada ? null : h('div', { class: 'segmentos' }, modos.map(([v, t]) => h('button', { 'aria-pressed': String(act.modoLibero === v), disabled: V.bloqueado, onclick: () => V.aplicar((e) => cambiarModoLibero(e, v)) }, t))), V.d.tiposLibero.map((t) => cupoLibero(V, t)));
}

function cambiosDelSet(V) {
  const { d, est } = V;
  const lista = est.actual.sustituciones.filter((s) => !s.porLibero);
  if (!est.actual.plantillaConfirmada) return null;
  return h('div', {}, h('div', { class: 'titulo-grupo' }, `Cambios · ${d.sustitucionesUsadas}/${MAX_SUSTITUCIONES}`), lista.length ? h('div', { class: 'lista-jugadas' }, lista.map((s) => h('div', {}, `${s.nuevoLibero ? 'Nuevo líbero' : s.excepcional ? 'Excepcional' : 'Cambio'}: entra ${d.nombre(s.jugadorEntraId)} por ${d.nombre(s.jugadorSaleId)}`, h('span', { class: 'cal' }, `${s.puntosLocal}-${s.puntosVisitante}`)))) : h('p', { class: 'nota' }, 'Todavía no hay cambios.'));
}

export function vistaPlantilla(V) {
  const act = V.est.actual;
  return h(
    'div',
    { class: 'plantilla' },
    h('div', { class: 'col', 'data-scroll': 'plantilla-izq' }, cancha(V), act.plantillaConfirmada ? controlesEnJuego(V) : controlesArmado(V)),
    h('div', { class: 'col', 'data-scroll': 'plantilla-der' }, modoLibero(V), cambiosDelSet(V), bancaLista(V))
  );
}
