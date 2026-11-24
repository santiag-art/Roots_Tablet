// Pantalla del partido: barra fija (marcador) + pestañas Plantilla y Acciones.
import { app, guardarPartido, irA, jugadoresDeTorneo } from '../contexto.js';
import {
  ErrorRegla, derivados, elegirFormato, elegirLadoPropio, elegirSaque, estaTerminado, guardarSet, marcarCambioCanchaHecho, nombresAmbiguos, partidoDecidido,
  pedirTiempoMuerto, corregirTiempoMuerto, corregirMarcadorSet, reabrirUltimoSet, cierreExactoDelSet, reabrirPartido, restarPunto, sumarPunto, terminarPartido, deshacerUltimaAccion, entrarLibero, MAX_SUSTITUCIONES, TIEMPOS_POR_SET,
} from '../motor.js';
import { errorMarcadorSet, errorOrdenSet } from '../reglas/reglasSet.js';
import { aplicarTema, temaActual } from './ajustes.js';
import { abrirVentana, confirmar, toast } from './aviso.js';
import { h, icono, rellenar } from './dom.js';
import { vistaAcciones, reiniciarSeleccion } from './acciones.js';
import { indicadorGuardado, exportarBorradorAhora } from './borradorPantalla.js';
import { tieneSetEnJuego } from '../borrador.js';
import { alertasEnVivo } from '../rachas.js';
import { avisosActivados, bajoElLimite, cambiosDelSet, guardarAvisosActivados, liberoPuedeEntrar, liberosQueSaldran } from '../avisosJuego.js';
import { guardarPreferenciasMarcador, leerPreferenciasMarcador, marcadorInvertido } from '../marcadorLados.js';
import { detalleRivalActivado, guardarDetalleRivalActivado } from '../puntosRival.js';
import { preguntarPuntoRival } from './puntoRival.js';
import { vistaPlantilla } from './plantilla.js';
import { vistaResumen } from './resumenPartido.js';
import { iniciarTiempoMuerto } from './tiempoMuerto.js';

let estadoVista = { partidoId: null, tab: 'plantilla', avisos: [], destellos: [], descartadas: new Set() };

function ctxDe(reg, jugadores) {
  return {
    jugadores,
    lesiones: app.lesiones,
    ahora: () => new Date(),
    avisar: (tipo, texto) => estadoVista.avisos.push({ tipo, texto }),
  };
}

export function vistaPartido(partidoId) {
  const reg = app.partidos.get(partidoId);
  if (!reg) {
    queueMicrotask(() => irA('#/'));
    return h('div', {});
  }
  if (estadoVista.partidoId !== partidoId) {
    estadoVista = { partidoId, tab: estaTerminado(reg.est) ? 'resumen' : reg.est.actual.plantillaConfirmada ? 'acciones' : 'plantilla', avisos: [], destellos: [], descartadas: new Set() };
    reiniciarSeleccion();
  }
  const est = reg.est;
  const jugadores = jugadoresDeTorneo(reg.torneoId);
  const ctx = ctxDe(reg, jugadores);
  const d = derivados(est, ctx);
  const bloqueado = estaTerminado(est);
  const nombres = { local: reg.equipoLocal, visitante: reg.equipoVisitante };

  const V = {
    reg, est, d, ctx, jugadores, bloqueado, nombres,
    pintar: () => app.renderizar(),
    avisoBloqueado: () => toast('El partido está terminado. Para cambiar algo, reábrelo desde el menú.', 'info'),
    aplicar(fn, { sobreTerminado = false } = {}) {
      if (estaTerminado(est) && !sobreTerminado) {
        V.avisoBloqueado();
        return false;
      }
      try {
        V.resultado = fn(est, ctx);
      } catch (err) {
        if (err instanceof ErrorRegla) {
          toast(err.message, 'error');
          return false;
        }
        throw err;
      }
      guardarPartido(reg);
      app.renderizar();
      return true;
    },
  };

  detectarDestellos(V);
  return h(
    'div',
    { class: 'partido' },
    barra(V),
    h('div', { class: 'avisos' }, avisos(V)),
    h('div', { class: 'cuerpo' }, est.formatoSets ? (estadoVista.tab === 'plantilla' ? vistaPlantilla(V) : estadoVista.tab === 'resumen' ? vistaResumen(V) : vistaAcciones(V)) : elegirFormatoVista(V))
  );
}

// ─────────────── Destellos (avisos que aparecen un momento) ───────────────
function destello(texto) {
  estadoVista.destellos.push({ texto, hasta: Date.now() + 6000 });
  setTimeout(() => {
    if (location.hash.startsWith('#/partido/')) app.renderizar();
  }, 6100);
}

// Compara con el dibujo anterior: avisa cuando bajan los cambios a 2, 1 o 0 y cuando el equipo rota (quién saca ahora).
function detectarDestellos(V) {
  const { est, d } = V;
  const act = est.actual;
  const restantes = cambiosDelSet({ usados: d.sustitucionesUsadas, maximo: MAX_SUSTITUCIONES });
  const antes = estadoVista.previo;
  if (antes && antes.sets === est.sets.length && act.plantillaConfirmada && avisosActivados()) {
    if (bajoElLimite(antes.restantes, restantes.restantes)) destello(restantes.aviso);
    const pasos = (((act.rotaciones - antes.rotaciones) % 6) + 6) % 6;
    const saca = act.slots[0];
    if (pasos === 1 && saca != null && act.slots.filter((id) => id != null).length === 6) {
      const j = d.jugadoresPorId.get(saca);
      destello(`Rotación: ahora saca ${j ? `${j.numero != null ? `#${j.numero} ` : ''}${j.nombre.split(' ')[0]}` : 'la jugadora de P1'}.`);
    }
  }
  estadoVista.previo = { sets: est.sets.length, rotaciones: act.rotaciones, restantes: restantes.restantes };
}

// Suma el punto y, si fue del rival, pregunta cómo anotó (se puede omitir o apagar desde el menú ⋮).
function sumarAlMarcador(V, lado) {
  const anotado = V.aplicar((e, c) => sumarPunto(e, c, lado, V.nombres));
  if (anotado && lado !== V.est.ladoPropio && detalleRivalActivado()) preguntarPuntoRival(V);
}

// Pide el tiempo muerto de un equipo y arranca la cuenta regresiva (igual desde el chip TM o desde una alerta).
function pedirTM(V, lado) {
  const nombre = V.nombres[lado];
  if (V.aplicar((e) => pedirTiempoMuerto(e, lado))) iniciarTiempoMuerto({ equipo: nombre, onDevolver: () => V.aplicar((e) => corregirTiempoMuerto(e, lado)) });
}

// ─────────────── Formato ───────────────
function elegirFormatoVista(V) {
  const poner = (valor) => V.aplicar((e) => elegirFormato(e, valor));
  return h('div', { class: 'formato' }, h('div', { class: 'tarjeta' }, h('h2', {}, '¿Cómo se juega este partido?'), h('p', { class: 'nota' }, `${V.reg.equipoLocal} vs ${V.reg.equipoVisitante}`), h('div', { class: 'dos' }, h('button', { class: 'btn btn-primario btn-grande', onclick: () => poner('mejor_de_3') }, 'Mejor de 3'), h('button', { class: 'btn btn-primario btn-grande', onclick: () => poner('mejor_de_5') }, 'Mejor de 5'))));
}

// ─────────────── Barra ───────────────
function barra(V) {
  const { reg, est, d } = V;
  const act = est.actual;
  const ultima = act.historial.at(-1);
  const invertido = marcadorInvertido(leerPreferenciasMarcador(), { setsGuardados: est.sets.length, cambioCanchaHecho: act.cambioCanchaHecho, esSetDecisivo: d.esSetDecisivo });
  if (estadoVista.invertido !== undefined && estadoVista.invertido !== invertido) toast('El marcador cambió de lado, igual que los equipos en la cancha.', 'info');
  estadoVista.invertido = invertido;
  const tab = (id, texto) => h('button', { role: 'tab', 'aria-selected': String(estadoVista.tab === id), onclick: () => { estadoVista.tab = id; app.renderizar(); } }, texto);

  const chipCambios = (derivs) => {
    const c = cambiosDelSet({ usados: derivs.sustitucionesUsadas, maximo: MAX_SUSTITUCIONES });
    return h('span', { class: `chip-cambios ${c.nivel}`, title: 'Sustituciones de este set (el líbero no cuenta)' }, `${c.restantes} ${c.restantes === 1 ? 'cambio' : 'cambios'}`);
  };
  const equipo = (lado) => {
    const nombre = V.nombres[lado];
    const usados = act.tiemposMuertos[lado];
    return h(
      'div',
      { class: `eq eq-${lado} ${est.ladoPropio === lado ? 'propio' : ''}` },
      h('div', { class: 'eq-nombre' }, nombre),
      h(
        'div',
        { class: 'eq-chips' },
        est.ladoPropio === lado && act.plantillaConfirmada && est.formatoSets && avisosActivados() ? chipCambios(d) : null,
        h('button', { class: `chip-saque ${act.saca === lado ? 'activo' : ''} ${act.saca == null ? 'pide' : ''}`, disabled: V.bloqueado, 'aria-pressed': String(act.saca === lado), onclick: () => V.aplicar((e) => elegirSaque(e, lado)) }, act.saca === lado ? 'Saca' : 'Sacar'),
        h(
          'button',
          {
            class: 'chip-tm',
            disabled: V.bloqueado || usados >= TIEMPOS_POR_SET,
            'aria-label': `Tiempo muerto de ${nombre}, usados ${usados} de ${TIEMPOS_POR_SET}`,
            onclick: () => pedirTM(V, lado),
          },
          'TM',
          h('span', { class: 'puntos-tm' }, Array.from({ length: TIEMPOS_POR_SET }, (_, i) => h('span', { class: `punto-tm ${i < usados ? 'usado' : ''}` })))
        )
      )
    );
  };
  const puntos = (lado) => {
    const n = lado === 'local' ? act.puntosLocal : act.puntosVisitante;
    return h(
      'div',
      { class: `puntos puntos-${lado === 'local' ? 'l' : 'v'}` },
      h('button', { class: 'btn-punto', 'aria-label': `Quitar punto a ${V.nombres[lado]}`, disabled: V.bloqueado || n === 0, onclick: () => V.aplicar((e, c) => restarPunto(e, c, lado, V.nombres)) }, icono('menos')),
      h('div', { class: 'marcador-num', 'aria-live': 'polite' }, n),
      h('button', { class: 'btn-punto mas', 'aria-label': `Punto para ${V.nombres[lado]}`, disabled: V.bloqueado, onclick: () => sumarAlMarcador(V, lado) }, icono('mas', { tam: 30, grueso: 3 }))
    );
  };

  return h(
    'header',
    { class: 'barra' },
    h(
      'div',
      { class: 'barra-fila1' },
      h('button', { class: 'btn-icono b-atras', 'aria-label': 'Volver a la lista', onclick: () => irA('#/') }, icono('atras')),
      h('div', { class: 'b-titulo' }, h('strong', {}, `${reg.equipoLocal} vs ${reg.equipoVisitante}`), h('span', {}, app.torneos.get(reg.torneoId)?.nombre ?? '', ' · ', indicadorGuardado())),
      h('div', { class: 'tabs', role: 'tablist' }, tab('plantilla', 'Plantilla'), tab('acciones', 'Acciones'), tab('resumen', 'Resumen')),
      h('button', { class: 'btn b-deshacer', disabled: V.bloqueado || !ultima, onclick: () => V.aplicar((e) => deshacerUltimaAccion(e)) }, icono('deshacer', { tam: 20 }), h('span', {}, ultima ? `Deshacer: ${ultima.texto}` : 'Deshacer')),
      h('button', { class: 'btn-icono b-menu', 'aria-label': 'Menú del partido', onclick: () => abrirMenu(V) }, icono('menu'))
    ),
    h(
      'div',
      { class: `barra-marcador${invertido ? ' invertida' : ''}` },
      equipo('local'),
      puntos('local'),
      h('div', { class: 'centro-marcador' }, h('div', { class: 'set-n' }, V.bloqueado ? 'Terminado' : `Set ${d.numeroSetActual}`), h('div', { class: 'sets-g' }, `${d.setsLocal} - ${d.setsVisitante}`), h('div', { class: 'formato' }, est.formatoSets === 'mejor_de_5' ? 'Mejor de 5' : est.formatoSets === 'mejor_de_3' ? 'Mejor de 3' : '')),
      puntos('visitante'),
      equipo('visitante')
    )
  );
}

// ─────────────── Avisos ───────────────
function avisos(V) {
  const { reg, est, d } = V;
  const act = est.actual;
  const lista = [];
  const aviso = (clase, contenido, boton) => h('div', { class: `aviso ${clase}` }, h('p', {}, contenido), boton);

  if (app.almacen.modo === 'memoria' || app.guardado.estado === 'error') {
    lista.push(aviso('aviso-error', [h('strong', {}, 'Lo último no se guardó en la tablet. '), 'Saca un borrador ahora para no perderlo y revisa el espacio.'], h('button', { class: 'btn btn-primario', onclick: () => exportarBorradorAhora([reg.id]) }, 'Exportar borrador')));
  }
  if (V.bloqueado) {
    lista.push(aviso('aviso-ok', [h('strong', {}, 'Partido terminado. '), partidoDecidido(est) ? 'Ya hay ganador por sets. Exporta los resultados desde el inicio.' : 'Lo cerraste a mano.', ' ¿Te equivocaste? Menú ⋮ → Corregir sets guardados.'], est.finalizado && !partidoDecidido(est) ? h('button', { class: 'btn', onclick: () => { reabrirPartido(est); guardarPartido(reg); app.renderizar(); } }, 'Reabrir') : null));
    return lista;
  }
  if (nombresAmbiguos(reg) && !reg.ladoConfirmado) {
    lista.push(aviso('', [h('strong', {}, '¿Cuál es tu equipo? '), 'Ninguno dice "Roots".'], h('div', { style: { display: 'flex', gap: '8px' } }, ['local', 'visitante'].map((lado) => h('button', { class: 'btn', onclick: () => { elegirLadoPropio(est, lado); reg.ladoConfirmado = true; guardarPartido(reg); app.renderizar(); } }, V.nombres[lado])))));
  }
  if (est.formatoSets && act.plantillaConfirmada && act.saca == null) lista.push(aviso('', [h('strong', {}, 'Elige quién saca '), 'con el botón "Sacar" del marcador.']));
  if (d.pideCambioCancha) lista.push(aviso('', [h('strong', {}, 'Cambio de cancha: '), 'los equipos cambian de lado (set decisivo, 8 puntos).'], h('button', { class: 'btn btn-primario', onclick: () => V.aplicar((e) => marcarCambioCanchaHecho(e)) }, 'Ya cambiaron')));
  if (est.formatoSets && !errorMarcadorSet({ numeroSet: d.numeroSetActual, totalSets: d.totalSets, puntosLocal: act.puntosLocal, puntosVisitante: act.puntosVisitante })) {
    lista.push(aviso('aviso-ok', [h('strong', {}, `Marcador de set completo (${act.puntosLocal}-${act.puntosVisitante}). `), '¿Guardas el set?'], h('button', { class: 'btn btn-primario', onclick: () => abrirTerminarSet(V) }, 'Terminar set')));
  }
  if (act.plantillaConfirmada && est.formatoSets && avisosActivados()) {
    const nombre = (id) => d.nombre(id).split(' ')[0];
    for (const x of liberosQueSaldran({ slots: act.slots, idsLibero: d.idsLibero, reemplazados: d.reemplazados, sacamos: d.sacamos })) {
      lista.push(aviso('aviso-destello', [h('strong', {}, 'La líbero sale: '), `${nombre(x.liberoId)} está en P${x.posicion}; si ganan este saque y rotan, sale y vuelve ${nombre(x.vuelveId)}.`]));
    }
    const ultLib = act.sustituciones.filter((x) => x.porLibero || x.nuevoLibero).at(-1);
    const entra = liberoPuedeEntrar({ slots: act.slots, idsLibero: d.idsLibero, jugadoresPorId: d.jugadoresEnPartido, sacamos: d.sacamos, ultimoCambio: ultLib?.porLibero ? ultLib : null, puntosLocal: act.puntosLocal, puntosVisitante: act.puntosVisitante });
    if (entra) {
      lista.push(aviso('aviso-destello', [h('strong', {}, 'Puede entrar la líbero: '), `${nombre(entra.liberoId)} por ${nombre(entra.saleId)} (central en P${entra.posicion}).`], h('button', { class: 'btn btn-primario', onclick: () => V.aplicar((e, c) => entrarLibero(e, c, entra.liberoId, entra.saleId)) }, 'Entrar')));
    }
  }
  if (act.plantillaConfirmada && est.formatoSets && avisosActivados()) {
    const propio = est.ladoPropio;
    const enCancha = [...d.enCancha];
    const alertas = alertasEnVivo({ puntosSeq: act.puntosSeq, eventos: act.eventos, ladoPropio: propio, nombres: V.nombres, enCancha, tmDisponibles: Math.max(0, TIEMPOS_POR_SET - act.tiemposMuertos[propio]), nombreDe: (id) => d.nombre(id).split(' ')[0] });
    for (const a of alertas) {
      const clave = `${d.numeroSetActual}|${a.clave}`;
      if (estadoVista.descartadas.has(clave)) continue;
      const descartar = () => { estadoVista.descartadas.add(clave); app.renderizar(); };
      lista.push(
        aviso(
          `aviso-alerta alerta-${a.nivel}`,
          [h('strong', {}, a.tipo === 'racha-rival' ? 'Racha del rival: ' : 'Errores seguidos: '), a.texto],
          h(
            'div',
            { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
            a.sugiereTiempoMuerto ? h('button', { class: 'btn btn-primario', onclick: () => { descartar(); pedirTM(V, propio); } }, 'Pedir tiempo muerto') : null,
            h('button', { class: 'btn-icono', 'aria-label': 'Cerrar alerta', onclick: descartar }, icono('cerrar', { tam: 18 }))
          )
        )
      );
    }
  }
  estadoVista.destellos = estadoVista.destellos.filter((x) => x.hasta > Date.now());
  if (avisosActivados()) estadoVista.destellos.forEach((x) => lista.push(aviso('aviso-destello', x.texto)));
  estadoVista.avisos.forEach((a, i) => lista.push(aviso('aviso-info', a.texto, h('button', { class: 'btn-icono', 'aria-label': 'Cerrar aviso', onclick: () => { estadoVista.avisos.splice(i, 1); app.renderizar(); } }, icono('cerrar', { tam: 18 })))));
  return lista;
}

// ─────────────── Marcador de un set (terminar o corregir) ───────────────
// validar(l, v) devuelve el texto del error o null. alGuardar(l, v) devuelve false si no se pudo.
function abrirMarcador(V, { titulo, subtitulo, inicial, validar, alGuardar, textoGuardar = 'Guardar set', textoOk }) {
  const val = { l: inicial.l, v: inicial.v };
  const cuerpo = h('div', {});
  const boton = { el: null };
  const lado = (clave, nombre) =>
    h(
      'div',
      { class: 'lado' },
      h('p', {}, nombre),
      h('div', { class: 'valor' }, h('button', { class: 'btn-punto', 'aria-label': `Menos a ${nombre}`, onclick: () => { val[clave] = Math.max(0, val[clave] - 1); pintar(); } }, icono('menos')), h('div', { class: 'num' }, val[clave]), h('button', { class: 'btn-punto', 'aria-label': `Más a ${nombre}`, onclick: () => { val[clave] += 1; pintar(); } }, icono('mas'))),
      h('div', { class: 'rapidos' }, [-5, 5].map((n) => h('button', { onclick: () => { val[clave] = Math.max(0, val[clave] + n); pintar(); } }, n > 0 ? `+${n}` : String(n))))
    );
  function pintar() {
    const err = validar(val.l, val.v);
    rellenar(cuerpo, h('div', { class: 'stepper' }, lado('l', V.nombres.local), h('div', { class: 'sep' }, '-'), lado('v', V.nombres.visitante)), err ? h('p', { class: 'error-linea' }, err) : h('p', { class: 'ok-linea' }, textoOk(val.l, val.v)));
    if (boton.el) boton.el.disabled = Boolean(err);
  }
  const ventana = abrirVentana({ titulo, subtitulo, ancho: 'media', contenido: cuerpo, acciones: [{ texto: 'Cancelar' }, { texto: textoGuardar, tipo: 'primario', onclick: () => alGuardar(val.l, val.v) }] });
  boton.el = ventana.el.querySelector('.ventana-pie .btn-primario');
  pintar();
}

function abrirTerminarSet(V) {
  const { est, d } = V;
  if (!est.formatoSets) return toast('Primero elige el formato del partido.', 'error');
  const existentes = est.sets.map((s) => ({ numeroSet: s.numeroSet, puntosLocal: s.puntosLocal, puntosVisitante: s.puntosVisitante }));
  abrirMarcador(V, {
    titulo: `Terminar el set ${d.numeroSetActual}`,
    subtitulo: 'Ajusta el marcador final si hace falta',
    inicial: { l: est.actual.puntosLocal, v: est.actual.puntosVisitante },
    validar: (l, v) => errorMarcadorSet({ numeroSet: d.numeroSetActual, totalSets: d.totalSets, puntosLocal: l, puntosVisitante: v }) || errorOrdenSet({ numeroSet: d.numeroSetActual, existentes, setsParaGanar: d.setsParaGanar }),
    textoOk: (l, v) => `Se guarda el set ${d.numeroSetActual}: ${l}-${v}.`,
    alGuardar: (l, v) => {
      const ok = V.aplicar((e, c) => guardarSet(e, c, l, v));
      if (!ok) return false;
      estadoVista.tab = 'plantilla';
      reiniciarSeleccion();
      toast(partidoDecidido(est) ? '¡Partido decidido!' : `Set ${d.numeroSetActual} guardado.`, 'ok');
    },
  });
}

// "rotación 3 de 6, saca Roots" (o "sin saque elegido" si nadie sacaba todavía).
function descripcionCierre(V, { rotaciones, saca }) {
  return `rotación ${rotaciones + 1} de 6, ${saca ? `saca ${V.nombres[saca]}` : 'sin saque elegido'}`;
}

// ─────────────── Corregir sets ya guardados ───────────────
function abrirCorregirSets(V) {
  const { est, reg } = V;
  const cuerpo = h('div', { class: 'lista-opciones' });
  const ventana = abrirVentana({ titulo: 'Corregir sets guardados', subtitulo: 'Cambia un marcador o vuelve a abrir el último set', contenido: cuerpo, ancho: 'media', acciones: [{ texto: 'Cerrar', tipo: 'primario' }] });
  const pintar = () => {
    rellenar(cuerpo, 
      est.sets.map((s) =>
        h('button', { class: 'opcion', onclick: () => { ventana.cerrar(); abrirCorregirMarcador(V, s.numeroSet); } }, icono('documento'), h('span', { class: 'datos' }, h('strong', {}, `Set ${s.numeroSet}: ${s.puntosLocal}-${s.puntosVisitante}`), h('small', {}, 'Toca para corregir el marcador')))
      ),
      est.sets.length
        ? h('button', { class: 'opcion principal', onclick: async () => {
            const ultimo = est.sets.at(-1);
            const exacto = cierreExactoDelSet(ultimo);
            const ok = await confirmar({ titulo: `Reabrir el set ${est.sets.length}`, texto: exacto ? `El set vuelve a quedar en juego como lo dejaste: ${descripcionCierre(V, ultimo.cierre)}, con su marcador y sus jugadas.` : 'El set vuelve a quedar en juego con su marcador y sus jugadas. Este set se guardó antes de que la app recordara la rotación: vuelve a la inicial del set (más los cambios); ajústala con "Rotar" y elige de nuevo quién saca.', si: 'Reabrir' });
            if (!ok) return;
            ventana.cerrar();
            if (V.aplicar((e) => reabrirUltimoSet(e), { sobreTerminado: true })) {
              estadoVista.tab = 'plantilla';
              toast(V.resultado?.exacta ? `Set reabierto: ${descripcionCierre(V, { rotaciones: V.resultado.rotaciones, saca: V.resultado.saca })}.` : 'Set reabierto. Ajusta la rotación y elige quién saca.', 'ok');
            }
          } }, icono('rotar'), h('span', { class: 'datos' }, h('strong', {}, `Reabrir el set ${est.sets.length} para seguir anotando`), h('small', {}, 'Si lo guardaste antes de tiempo')))
        : h('p', { class: 'nota' }, 'Todavía no hay sets guardados.')
    );
  };
  pintar();
  void reg;
}

function abrirCorregirMarcador(V, numeroSet) {
  const { est, reg } = V;
  const s = est.sets.find((x) => x.numeroSet === numeroSet);
  abrirMarcador(V, {
    titulo: `Corregir el set ${numeroSet}`,
    subtitulo: `Ahora dice ${s.puntosLocal}-${s.puntosVisitante}`,
    inicial: { l: s.puntosLocal, v: s.puntosVisitante },
    validar: (l, v) => {
      try {
        corregirMarcadorSet(structuredClone(est), numeroSet, l, v);
        return null;
      } catch (err) {
        return err instanceof ErrorRegla ? err.message : String(err);
      }
    },
    textoOk: (l, v) => `El set ${numeroSet} queda ${l}-${v}.`,
    textoGuardar: 'Guardar corrección',
    alGuardar: (l, v) => {
      if (!V.aplicar((e) => corregirMarcadorSet(e, numeroSet, l, v), { sobreTerminado: true })) return false;
      toast('Marcador corregido.', 'ok');
    },
  });
  void reg;
}

async function abrirTerminarPartido(V) {
  const { est, reg } = V;
  if (est.sets.length === 0) return toast('Guarda al menos un set antes de terminar el partido.', 'error');
  let texto = 'Se cierra el partido y ya podrás exportarlo.';
  const sinGuardar = est.actual.puntosLocal + est.actual.puntosVisitante > 0;
  if (sinGuardar) texto = `Hay un set en juego (${est.actual.puntosLocal}-${est.actual.puntosVisitante}) que NO se ha guardado y no se exportará. Si ya terminó, cancela y usa "Terminar set". ¿Cerrar el partido igual?`;
  const ok = await confirmar({ titulo: 'Terminar el partido', texto, si: 'Terminar partido', peligro: sinGuardar });
  if (!ok) return;
  terminarPartido(est);
  guardarPartido(reg);
  estadoVista.tab = 'resumen'; // lo primero que se mira al terminar: cómo anotó el rival y el mapa de calor
  app.renderizar();
}

// ─────────────── Menú ───────────────
function abrirMenu(V) {
  const { est, reg, d } = V;
  const opcion = (icon, titulo, sub, fn, extra = '') => h('button', { class: `opcion ${extra}`, onclick: () => { v.cerrar(); fn(); } }, icono(icon), h('span', { class: 'datos' }, h('strong', {}, titulo), sub ? h('small', {}, sub) : null));
  const filas = [];
  if (!V.bloqueado && est.formatoSets) {
    filas.push(opcion('ok', `Terminar set ${d.numeroSetActual}`, 'Guarda el marcador y pasa al siguiente set', () => abrirTerminarSet(V), 'principal'));
    filas.push(opcion('candado', 'Terminar partido', 'Cierra el partido a mano', () => abrirTerminarPartido(V)));
  }
  if (est.sets.length > 0) filas.push(opcion('lista', 'Corregir sets guardados', 'Cambiar un marcador o reabrir el último set', () => abrirCorregirSets(V)));
  if (est.finalizado && !partidoDecidido(est)) filas.push(opcion('rotar', 'Reabrir partido', '', () => { reabrirPartido(est); guardarPartido(reg); app.renderizar(); }));
  if (!V.bloqueado) {
    filas.push(opcion('lista', 'Nuestro equipo', `Ahora: ${V.nombres[est.ladoPropio]}`, () => { elegirLadoPropio(est, est.ladoPropio === 'local' ? 'visitante' : 'local'); reg.ladoConfirmado = true; guardarPartido(reg); app.renderizar(); toast(`Nuestro equipo: ${V.nombres[est.ladoPropio]}.`, 'ok'); }));
    if (est.sets.length === 0) filas.push(opcion('documento', 'Formato del partido', est.formatoSets === 'mejor_de_5' ? 'Mejor de 5' : est.formatoSets === 'mejor_de_3' ? 'Mejor de 3' : 'Sin elegir', () => abrirFormato(V)));
  }
  if (est.sets.length > 0 || tieneSetEnJuego(reg)) filas.push(opcion('bajar', 'Exportar borrador', 'Todo lo anotado, también el set en juego', () => exportarBorradorAhora([reg.id])));
  const prefs = leerPreferenciasMarcador();
  const cambiarPrefs = (cambio) => { guardarPreferenciasMarcador({ ...prefs, ...cambio }); app.renderizar(); };
  filas.push(opcion('rotar', 'Invertir el marcador', prefs.invertido ? 'Ahora: invertido (para zurdas)' : 'Ahora: normal. Pone cada equipo del otro lado', () => cambiarPrefs({ invertido: !prefs.invertido })));
  filas.push(opcion('rotar', 'Marcador sigue el cambio de cancha', prefs.sigue ? 'Activado: cambia de lado entre sets y a los 8 puntos del set decisivo' : 'Apagado', () => cambiarPrefs({ sigue: !prefs.sigue })));
  filas.push(opcion('lista', 'Avisos del partido', avisosActivados() ? 'Activados: cambios que quedan, rotación, líbero y rachas' : 'Apagados', () => { guardarAvisosActivados(!avisosActivados()); app.renderizar(); }));
  filas.push(opcion('lista', 'Detalle de los puntos del rival', detalleRivalActivado() ? 'Activado: al sumarle un punto al rival preguntas cómo anotó (ataque con zonas, saque, bloqueo o error)' : 'Apagado', () => { guardarDetalleRivalActivado(!detalleRivalActivado()); app.renderizar(); }));
  filas.push(opcion(temaActual() === 'claro' ? 'luna' : 'sol', temaActual() === 'claro' ? 'Tema oscuro' : 'Tema claro', '', () => { aplicarTema(temaActual() === 'claro' ? 'oscuro' : 'claro'); app.renderizar(); }));
  filas.push(opcion('atras', 'Volver a la lista', 'Lo anotado ya está guardado', () => irA('#/')));
  const v = abrirVentana({ titulo: 'Menú del partido', contenido: h('div', { class: 'lista-opciones' }, filas), ancho: 'chica' });
}

function abrirFormato(V) {
  abrirVentana({
    titulo: 'Formato del partido',
    ancho: 'chica',
    contenido: (cerrar) => h('div', { class: 'lista-opciones' }, [['mejor_de_3', 'Mejor de 3'], ['mejor_de_5', 'Mejor de 5']].map(([valor, t]) => h('button', { class: `opcion ${V.est.formatoSets === valor ? 'principal' : ''}`, onclick: () => { V.aplicar((e) => elegirFormato(e, valor)); cerrar(); } }, h('span', { class: 'datos' }, h('strong', {}, t))))),
  });
}
