// Motor del partido en vivo para la tablet.
//
// Es la misma lógica de la pantalla AnotacionEnVivo de Roots (rotación, saque, líberos, cambios, tiempos muertos,
// deshacer, cierre de sets), pero sin servidor: las reglas que antes validaba el backend (reglasSet y reglasSustitucion)
// se aplican aquí con las mismas funciones. Nada se automatiza más de lo que ya hace Roots.
//
// Todo vive en un objeto de estado simple (`est`, ver nuevoEstadoPartido) que se puede guardar como JSON.
// Cada función pública valida primero y, si una regla falla, lanza ErrorRegla SIN dejar el estado a medias.
import { rotar, reemplazadosPorLibero, slotsDesdeTitulares, aplicarSustituciones } from './reglas/rotaciones.js';
import { TIPOS_LIBERO_POR_MODO, INDICES_LIBERO } from './reglas/liberos.js';
import { contarSetsGanados, requiereCambioDeCancha } from './reglas/voleibol.js';
import { formatoDeSets, errorMarcadorSet, errorOrdenSet } from './reglas/reglasSet.js';
import {
  errorReingreso,
  errorCambioExcepcional,
  errorNuevoLibero,
  errorJugadaCompletaLibero,
  idsEnCancha,
} from './reglas/reglasSustitucion.js';
import { fundamentosPermitidos } from './reglas/fundamentosPosicion.js';
import { posicionNeutra } from './reglas/posiciones.js';
import { avisoSacadorFueraDeRotacion } from './reglas/faltaPosicion.js';

export const MAX_SUSTITUCIONES = 6;
export const TIEMPOS_POR_SET = 2;
const MAX_HISTORIAL = 50;
const VERSION_ESTADO = 1;

export class ErrorRegla extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = 'ErrorRegla';
  }
}
const fallo = (mensaje) => {
  throw new ErrorRegla(mensaje);
};

// ─────────────────────────── Estado ───────────────────────────

export function nuevoSetEnCurso(anterior = null) {
  return {
    puntosLocal: 0,
    puntosVisitante: 0,
    saca: null, // 'local' | 'visitante' | null (sin elegir)
    primerSaque: null,
    tiemposMuertos: { local: 0, visitante: 0 },
    cambioCanchaHecho: false,
    // Líberos: ninguno, uno o dos. Se conservan de un set al siguiente (como en Roots).
    modoLibero: anterior?.modoLibero ?? 'ninguno',
    liberos: anterior ? { ...anterior.liberos } : { unico: null, recepcion: null, defensa: null },
    slots: anterior ? [...anterior.slots] : Array(6).fill(null), // índice 0 = P1 (saque)
    rotaciones: 0,
    plantillaConfirmada: false,
    titulares: [], // filas de la plantilla confirmada: { id, jugadorId, esLibero, tipoLibero, posicion }
    sustituciones: [],
    eventos: [],
    historial: [],
  };
}

// Nuestro equipo: si solo uno de los dos nombres contiene "Roots" es ese; si no, se asume el local (se puede cambiar en pantalla).
export function ladoPropioPorNombre(partido) {
  return /roots/i.test(partido.equipoVisitante ?? '') && !/roots/i.test(partido.equipoLocal ?? '') ? 'visitante' : 'local';
}

export function nuevoEstadoPartido(partido) {
  return {
    version: VERSION_ESTADO,
    partidoId: partido.id,
    formatoSets: partido.formatoSets ?? null,
    ladoPropio: ladoPropioPorNombre(partido),
    sets: [], // sets cerrados: { numeroSet, puntosLocal, puntosVisitante, titulares, sustituciones, eventos, tiemposMuertos }
    finalizado: false, // "Terminar partido" (el partido también queda decidido solo al ganar los sets necesarios)
    siguienteId: 1,
    actual: nuevoSetEnCurso(),
    creadoEn: new Date().toISOString(),
    actualizadoEn: null,
  };
}

// ─────────────────────────── Derivados (lo que la pantalla necesita ver) ───────────────────────────

// ctx = { jugadores: [...del torneo], lesiones: Map jugadorId -> {disponibilidad, zonas}, ahora: () => Date, avisar: (tipo, texto) => void }
export function derivados(est, ctx) {
  const act = est.actual;
  const jugadoresPorId = new Map(ctx.jugadores.map((j) => [j.id, j]));
  const enCancha = act.slots.filter((id) => id != null);
  const tiposLibero = TIPOS_LIBERO_POR_MODO[act.modoLibero];
  const idsLibero = tiposLibero.map((t) => act.liberos[t]).filter(Boolean);
  const tipoLiberoPorId = new Map(tiposLibero.filter((t) => act.liberos[t]).map((t) => [act.liberos[t], t]));
  const reemplazados = reemplazadosPorLibero(act.sustituciones, idsLibero);
  const reemplazadosIds = new Set(reemplazados.values());
  const todas = todasLasSustituciones(est);
  const inhabilitadosLibero = new Set(todas.filter((s) => s.nuevoLibero).map((s) => s.jugadorSaleId));
  const salieronExcepcionalIds = new Set(todas.filter((s) => s.excepcional).map((s) => s.jugadorSaleId));
  const jugadoresBanca = ctx.jugadores.filter(
    (j) => !enCancha.includes(j.id) && !idsLibero.includes(j.id) && !reemplazadosIds.has(j.id) && !inhabilitadosLibero.has(j.id)
  );
  const { totalSets, setsParaGanar } = formatoDeSets(est.formatoSets);
  const { local: setsLocal, visitante: setsVisitante } = contarSetsGanados(setsComoMarcador(est));
  const numeroSetActual = est.sets.length + 1;
  const hayGanador = Boolean(est.formatoSets) && (setsLocal >= setsParaGanar || setsVisitante >= setsParaGanar);
  const sacamos = act.saca == null ? null : act.saca === est.ladoPropio;
  return {
    act,
    jugadoresPorId,
    enCancha,
    tiposLibero,
    idsLibero,
    esLiberoId: (id) => idsLibero.includes(id),
    tipoLiberoPorId,
    reemplazados,
    reemplazadosIds,
    inhabilitadosLibero,
    salieronExcepcionalIds,
    jugadoresBanca,
    candidatasNuevoLibero: jugadoresBanca.filter((j) => !salieronExcepcionalIds.has(j.id)),
    sustitucionesUsadas: act.sustituciones.filter((x) => !x.porLibero && !x.excepcional && !x.nuevoLibero).length,
    plantillaCompleta: enCancha.length === 6 && tiposLibero.every((t) => Boolean(act.liberos[t])),
    totalSets,
    setsParaGanar,
    setsLocal,
    setsVisitante,
    numeroSetActual,
    esSetDecisivo: Boolean(est.formatoSets) && numeroSetActual === totalSets,
    hayGanador,
    sacamos,
    nombresAmbiguos: false, // lo completa la pantalla con el partido (ver nombresAmbiguos)
    pideCambioCancha:
      !act.cambioCanchaHecho &&
      !hayGanador &&
      Boolean(est.formatoSets) &&
      requiereCambioDeCancha({ numeroSet: numeroSetActual, totalSets, puntosLocal: act.puntosLocal, puntosVisitante: act.puntosVisitante }),
    nombre: (id) => jugadoresPorId.get(id)?.nombre ?? 'jugadora sin registrar',
  };
}

export function nombresAmbiguos(partido) {
  return /roots/i.test(partido.equipoLocal ?? '') === /roots/i.test(partido.equipoVisitante ?? '');
}

export function setsComoMarcador(est) {
  return est.sets.map((s) => ({ local: s.puntosLocal, visitante: s.puntosVisitante }));
}

export function partidoDecidido(est) {
  const { setsParaGanar } = formatoDeSets(est.formatoSets);
  const { local, visitante } = contarSetsGanados(setsComoMarcador(est));
  return Boolean(est.formatoSets) && (local >= setsParaGanar || visitante >= setsParaGanar);
}

export function todasLasSustituciones(est) {
  return [...est.sets.flatMap((s) => s.sustituciones), ...est.actual.sustituciones];
}

export function todosLosEventos(est) {
  return [...est.sets.flatMap((s) => s.eventos), ...est.actual.eventos];
}

export function statsJugador(est, jugadorId) {
  const eventos = todosLosEventos(est).filter((e) => e.jugadorId === jugadorId);
  const cuenta = (c) => eventos.filter((e) => e.calificacion === c).length;
  return { doble_positivo: cuenta('doble_positivo'), positivo: cuenta('positivo'), negativo: cuenta('negativo'), error: cuenta('error') };
}

// ¿Hay algo anotado en el set en curso? (para avisar al exportar un partido a medias)
export function setEnCursoTieneDatos(est) {
  const a = est.actual;
  return a.puntosLocal + a.puntosVisitante > 0 || a.eventos.length > 0 || a.sustituciones.length > 0 || a.titulares.length > 0;
}

// ─────────────────────────── Utilidades internas ───────────────────────────

function ahoraISO(ctx) {
  return (ctx?.ahora ? ctx.ahora() : new Date()).toISOString();
}

function nuevoId(est) {
  const id = est.siguienteId;
  est.siguienteId += 1;
  return id;
}

// Si una regla falla a mitad de una acción, el estado vuelve a como estaba.
function transaccion(est, fn) {
  const copia = structuredClone(est);
  try {
    return fn();
  } catch (err) {
    Object.keys(est).forEach((k) => delete est[k]);
    Object.assign(est, copia);
    throw err;
  }
}

function registrarAccion(act, entrada) {
  act.historial = [...act.historial.slice(-(MAX_HISTORIAL - 1)), entrada];
}

function ordenarSustituciones(lista) {
  return [...lista].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en) || (a.id ?? 0) - (b.id ?? 0));
}

function sustitucionesPorLiberoDelSet(act) {
  return ordenarSustituciones(act.sustituciones.filter((s) => s.porLibero || s.nuevoLibero));
}

// Si algún líbero está en cancha, vuelve a su casilla quien reemplazó (sin registrar cambio).
function slotsSinLiberos(act, d) {
  return act.slots.map((jid) => (jid != null && d.reemplazados.has(jid) ? d.reemplazados.get(jid) : jid));
}

function jugadorDelTorneo(ctx, jugadorId) {
  return ctx.jugadores.some((j) => j.id === jugadorId);
}

// ─────────────────────────── Formato, saque, tiempos muertos, cancha ───────────────────────────

export function elegirFormato(est, valor) {
  if (est.sets.length > 0) return; // no se cambia el formato a mitad de partido
  if (valor !== 'mejor_de_3' && valor !== 'mejor_de_5') fallo('Elige mejor de 3 o mejor de 5.');
  est.formatoSets = valor;
}

export function elegirLadoPropio(est, lado) {
  if (lado === 'local' || lado === 'visitante') est.ladoPropio = lado;
}

// Elegir (o corregir) quién saca. Solo cambia el indicador: no rota ni toca el marcador.
export function elegirSaque(est, lado) {
  const act = est.actual;
  act.saca = lado;
  // Mientras el set no tenga puntos, elegir de nuevo es corregir el primer saque (así el siguiente set alterna bien).
  if (act.primerSaque == null || act.puntosLocal + act.puntosVisitante === 0) act.primerSaque = lado;
}

export function pedirTiempoMuerto(est, lado) {
  const t = est.actual.tiemposMuertos;
  if (t[lado] >= TIEMPOS_POR_SET) fallo('Ese equipo ya usó sus 2 tiempos muertos en este set.');
  t[lado] = Math.min(TIEMPOS_POR_SET, t[lado] + 1);
}

export function corregirTiempoMuerto(est, lado) {
  const t = est.actual.tiemposMuertos;
  t[lado] = Math.max(0, t[lado] - 1);
}

export function marcarCambioCanchaHecho(est) {
  est.actual.cambioCanchaHecho = true;
}

// ─────────────────────────── Plantilla (antes de confirmar) ───────────────────────────

function exigirPlantillaAbierta(est) {
  if (est.actual.plantillaConfirmada) fallo('La plantilla ya está confirmada: toca "Editar" para cambiarla.');
}

export function cambiarModoLibero(est, modo) {
  exigirPlantillaAbierta(est);
  const act = est.actual;
  if (modo === act.modoLibero) return;
  const primero = act.liberos.unico ?? act.liberos.recepcion ?? act.liberos.defensa ?? null;
  act.modoLibero = modo;
  if (modo === 'ninguno') act.liberos = { unico: null, recepcion: null, defensa: null };
  else if (modo === 'uno') act.liberos = { unico: primero, recepcion: null, defensa: null };
  else act.liberos = { unico: null, recepcion: primero, defensa: act.liberos.defensa ?? null };
}

export function elegirLibero(est, ctx, jugadorId, clave) {
  exigirPlantillaAbierta(est);
  const d = derivados(est, ctx);
  if (!d.tiposLibero.includes(clave)) fallo('Ese tipo de líbero no está activo.');
  if (d.inhabilitadosLibero.has(jugadorId)) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');
  if (d.enCancha.includes(jugadorId)) fallo('Quita primero a esa jugadora de la cancha para asignarla como líbero.');
  const otra = d.tiposLibero.find((t) => est.actual.liberos[t] === jugadorId);
  if (otra && otra !== clave) est.actual.liberos[otra] = null;
  est.actual.liberos[clave] = jugadorId;
}

export function quitarLibero(est, clave) {
  exigirPlantillaAbierta(est);
  est.actual.liberos[clave] = null;
}

// Un toque: entra en la primera casilla libre, o sale si ya estaba en cancha.
export function toggleJugador(est, ctx, jugadorId) {
  exigirPlantillaAbierta(est);
  const d = derivados(est, ctx);
  if (d.esLiberoId(jugadorId)) return; // ya tiene su propio cupo
  const slots = est.actual.slots;
  const indice = slots.indexOf(jugadorId);
  if (indice >= 0) {
    slots[indice] = null;
    return;
  }
  if (d.inhabilitadosLibero.has(jugadorId)) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');
  const libre = slots.indexOf(null);
  if (libre < 0) fallo('En cancha solo pueden estar 6 jugadores (los líberos van aparte).');
  slots[libre] = jugadorId;
}

// Poner a alguien en una posición concreta. Si estaba ocupada, el ocupante cambia de lugar con el jugador de origen
// (o vuelve a la banca si el jugador venía de la plantilla).
export function colocarEnPosicion(est, ctx, jugadorId, indiceDestino) {
  exigirPlantillaAbierta(est);
  const d = derivados(est, ctx);
  const act = est.actual;
  const ocupante = act.slots[indiceDestino];
  if (ocupante === jugadorId) return;
  if (d.inhabilitadosLibero.has(jugadorId)) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');
  const claveLibero = d.tiposLibero.find((t) => act.liberos[t] === jugadorId);
  const indiceOrigen = act.slots.indexOf(jugadorId);
  if (claveLibero) act.liberos[claveLibero] = ocupante ?? null;
  if (indiceOrigen >= 0) act.slots[indiceOrigen] = ocupante ?? null;
  act.slots[indiceDestino] = jugadorId;
}

// Poner a alguien como líbero (recepción, defensa o único). Si el cupo estaba ocupado, el anterior ocupa el lugar de origen.
export function colocarComoLibero(est, ctx, jugadorId, clave) {
  exigirPlantillaAbierta(est);
  const d = derivados(est, ctx);
  const act = est.actual;
  if (!d.tiposLibero.includes(clave) || act.liberos[clave] === jugadorId) return;
  if (d.inhabilitadosLibero.has(jugadorId)) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');
  const previo = act.liberos[clave];
  const claveOrigen = d.tiposLibero.find((t) => act.liberos[t] === jugadorId);
  const indiceOrigen = act.slots.indexOf(jugadorId);
  act.liberos[clave] = jugadorId;
  if (claveOrigen) act.liberos[claveOrigen] = previo ?? null;
  if (indiceOrigen >= 0) act.slots[indiceOrigen] = previo ?? null;
}

export function devolverABanca(est, ctx, jugadorId) {
  exigirPlantillaAbierta(est);
  const d = derivados(est, ctx);
  const act = est.actual;
  const indice = act.slots.indexOf(jugadorId);
  if (indice >= 0) act.slots[indice] = null;
  const clave = d.tiposLibero.find((t) => act.liberos[t] === jugadorId);
  if (clave) act.liberos[clave] = null;
}

// Jugadores alineados (cancha + líberos) que Roots marcó "no apta": la pantalla pide confirmación antes de seguir.
export function alineadosNoAptos(est, ctx) {
  const d = derivados(est, ctx);
  const ids = [...d.enCancha, ...d.idsLibero.filter((id) => !d.enCancha.includes(id))];
  return ids.filter((id) => ctx.lesiones.get(id)?.disponibilidad === 'no_apta').map((id) => d.jugadoresPorId.get(id)).filter(Boolean);
}

export function confirmarPlantilla(est, ctx) {
  return transaccion(est, () => {
    const act = est.actual;
    const d = derivados(est, ctx);
    if (d.enCancha.length < 6) fallo(`Selecciona ${6 - d.enCancha.length} más para confirmar.`);
    if (!d.plantillaCompleta) fallo(d.tiposLibero.length > 1 ? 'Elige los dos líberos para confirmar.' : 'Elige el líbero para confirmar.');
    const todos = [...d.enCancha, ...d.idsLibero];
    if (new Set(todos).size !== todos.length) fallo('Ese jugador ya está en la plantilla de este set.');
    const inhabilitado = todos.find((id) => d.inhabilitadosLibero.has(id));
    if (inhabilitado != null) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');
    // Los cambios de líbero del intento anterior ya no aplican a la formación nueva.
    act.sustituciones = act.sustituciones.filter((x) => !x.porLibero);
    // Lo que se guarda es la formación actual: de ahí cuentan las rotaciones desde cero.
    const filas = act.slots.map((jugadorId, i) => ({ id: nuevoId(est), jugadorId, esLibero: false, tipoLibero: null, posicion: i + 1 }));
    d.tiposLibero.forEach((tipo) => {
      if (act.liberos[tipo]) filas.push({ id: nuevoId(est), jugadorId: act.liberos[tipo], esLibero: true, tipoLibero: tipo, posicion: null });
    });
    act.titulares = filas;
    act.rotaciones = 0;
    act.plantillaConfirmada = true;
    act.historial = [];
  });
}

export function editarPlantilla(est, ctx) {
  const act = est.actual;
  const d = derivados(est, ctx);
  act.slots = slotsSinLiberos(act, d);
  act.historial = [];
  act.plantillaConfirmada = false;
}

// ─────────────────────────── Líberos en juego ───────────────────────────

// Entrada de un líbero por una zaguera: ilimitada, no cuenta como sustitución.
export function entrarLibero(est, ctx, liberoId, saleId) {
  return transaccion(est, () => {
    const act = est.actual;
    const d = derivados(est, ctx);
    const indice = act.slots.indexOf(saleId);
    const cambioEntreLiberos = d.esLiberoId(saleId);
    if (cambioEntreLiberos && saleId === liberoId) return null;
    if (!d.esLiberoId(liberoId)) fallo('Un cambio de líbero debe incluir a uno de los líberos de este set.');
    if (!INDICES_LIBERO.includes(indice)) fallo('El líbero no puede subir a la delantera (P4, P3, P2): entra por P1, P5 o P6.');
    if (indice === 0 && d.sacamos == null) fallo('Elige primero quién saca (panel "Saque"): el líbero solo puede entrar por P1 cuando estamos recibiendo.');
    if (indice === 0 && d.sacamos === true) fallo('Estamos sacando: el líbero no puede entrar por quien saca (P1). Entra cuando el rival tenga el saque.');
    const nueva = crearSustitucionLibero(est, ctx, { saleId, entraId: liberoId, exento: false });
    act.slots = act.slots.map((jid) => (jid === saleId ? liberoId : jid));
    registrarAccion(act, {
      tipo: 'sustitucion',
      sub: nueva,
      saleId,
      entraId: liberoId,
      texto: cambioEntreLiberos
        ? `Cambio de líbero: ${d.nombre(liberoId)} por ${d.nombre(saleId)}`
        : `Entra líbero ${d.nombre(liberoId)}`.trim(),
    });
    return nueva;
  });
}

// Crea el registro de un cambio de líbero validando la regla 19.3.2.1 (una jugada completa entre dos cambios).
function crearSustitucionLibero(est, ctx, { saleId, entraId, exento, puntos = null }) {
  const act = est.actual;
  const puntosLocal = puntos?.local ?? act.puntosLocal;
  const puntosVisitante = puntos?.visitante ?? act.puntosVisitante;
  const ultimo = sustitucionesPorLiberoDelSet(act).at(-1);
  // Tras designar un nuevo líbero (19.4), su primera entrada no espera jugada: el anterior no podía continuar.
  const ultimoCambio = ultimo && ultimo.porLibero ? ultimo : null;
  const ids = act.titulares.filter((t) => t.esLibero).map((t) => t.jugadorId);
  const error = errorJugadaCompletaLibero({ ultimoCambio, puntosLocal, puntosVisitante, exento: Boolean(exento) && ids.includes(saleId) });
  if (error) fallo(error);
  const nueva = {
    id: nuevoId(est),
    jugadorSaleId: saleId,
    jugadorEntraId: entraId,
    porLibero: true,
    excepcional: false,
    nuevoLibero: false,
    puntosLocal,
    puntosVisitante,
    creado_en: ahoraISO(ctx),
  };
  act.sustituciones.push(nueva);
  return nueva;
}

// Salida del líbero: vuelve a cancha quien había reemplazado. Tampoco cuenta como sustitución.
export function salirLibero(est, ctx, liberoId, { avisar = false, puntos = null, exento = false, registrar = true } = {}) {
  return transaccion(est, () => {
    const act = est.actual;
    const d = derivados(est, ctx);
    const vuelveId = d.reemplazados.get(liberoId);
    if (vuelveId == null) fallo('No se encontró a quién reemplazó este líbero.');
    const nueva = crearSustitucionLibero(est, ctx, { saleId: liberoId, entraId: vuelveId, exento: avisar || exento, puntos });
    act.slots = act.slots.map((jid) => (jid === liberoId ? vuelveId : jid));
    // Si sale por una rotación, ese cambio queda dentro de la entrada de la rotación (no se registra aparte).
    if (!avisar && registrar) {
      registrarAccion(act, { tipo: 'sustitucion', sub: nueva, saleId: liberoId, entraId: vuelveId, texto: `Sale líbero ${d.nombre(liberoId)}`.trim() });
    }
    if (avisar) {
      const lib = d.nombre(liberoId).split(' ')[0];
      const vuelve = d.nombre(vuelveId).split(' ')[0];
      ctx.avisar?.('libero', `${lib} salió porque la rotación lo llevó a P1 (al recuperar el saque) o a la delantera. Vuelve ${vuelve}.`);
    }
    return { sub: nueva, saleId: liberoId, entraId: vuelveId };
  });
}

// Regla 19.4: el líbero no puede seguir; otra jugadora que no esté en cancha pasa a ser líbero por el resto del partido.
// Si el líbero estaba en cancha, primero sale (vuelve quien reemplazó) y luego se designa a la nueva.
export function designarNuevoLibero(est, ctx, lesionadoId, nuevoId_) {
  return transaccion(est, () => {
    const act = est.actual;
    let d = derivados(est, ctx);
    const clave = d.tipoLiberoPorId.get(lesionadoId);
    if (!clave) fallo('La jugadora que no puede seguir debe ser un líbero de este set (regla 19.4.1).');
    if (!jugadorDelTorneo(ctx, nuevoId_)) fallo('La jugadora elegida ya no existe.');
    if (d.reemplazadosIds.has(nuevoId_)) fallo('Esa jugadora está fuera por el líbero: vuelve cuando el líbero salga.');
    if (act.slots.includes(lesionadoId)) salirLibero(est, ctx, lesionadoId, { exento: true });
    d = derivados(est, ctx);
    const todas = todasLasSustituciones(est);
    const titularesCancha = act.titulares.filter((t) => !t.esLibero).map((t) => t.jugadorId);
    const error = errorNuevoLibero({
      lesionadoId,
      nuevoId: nuevoId_,
      idsLiberoSet: act.titulares.filter((t) => t.esLibero).map((t) => t.jugadorId),
      inhabilitadosIds: todas.filter((s) => s.nuevoLibero).map((s) => s.jugadorSaleId),
      enCanchaIds: idsEnCancha(titularesCancha, act.sustituciones),
      salieronExcepcionalIds: todas.filter((s) => s.excepcional).map((s) => s.jugadorSaleId),
    });
    if (error) fallo(error);
    const sustitucion = {
      id: nuevoId(est),
      jugadorSaleId: lesionadoId,
      jugadorEntraId: nuevoId_,
      porLibero: false,
      excepcional: false,
      nuevoLibero: true,
      puntosLocal: act.puntosLocal,
      puntosVisitante: act.puntosVisitante,
      creado_en: ahoraISO(ctx),
    };
    act.sustituciones.push(sustitucion);
    const fila = act.titulares.find((t) => t.esLibero && t.jugadorId === lesionadoId);
    if (fila) fila.jugadorId = nuevoId_;
    act.liberos[clave] = nuevoId_;
    registrarAccion(act, {
      tipo: 'nuevoLibero',
      sub: sustitucion,
      clave,
      lesionadoId,
      nuevoId: nuevoId_,
      texto: `Nuevo líbero: ${d.nombre(nuevoId_)} por ${d.nombre(lesionadoId)}`,
    });
    return sustitucion;
  });
}

// ─────────────────────────── Cambios (sustituciones) ───────────────────────────

export function ejecutarSustitucion(est, ctx, saleId, entraId, { excepcional = false } = {}) {
  return transaccion(est, () => {
    const act = est.actual;
    const d = derivados(est, ctx);
    if (!act.plantillaConfirmada) fallo('Confirma la plantilla antes de hacer cambios.');
    if (d.esLiberoId(saleId)) fallo('El líbero no se sustituye: sácalo con su botón y vuelve quien reemplazó.');
    if (!act.slots.includes(saleId)) fallo('Esa jugadora no está en la cancha.');
    if (saleId === entraId) fallo('Un jugador no puede sustituirse a sí mismo.');
    if (!jugadorDelTorneo(ctx, entraId)) fallo('Esa jugadora no está en la plantilla de este torneo.');
    if (d.reemplazadosIds.has(entraId)) fallo(`${d.nombre(entraId)} está fuera por el líbero: vuelve cuando el líbero salga.`);
    if (d.esLiberoId(entraId)) fallo('Un líbero entra con su propio botón "Entrar", no como sustitución.');
    if (act.slots.includes(entraId)) fallo('Esa jugadora ya está en la cancha.');
    // Regla 19.4.2.2: el líbero declarado no apto no vuelve a jugar en el partido.
    if (d.inhabilitadosLibero.has(entraId)) fallo('Ese jugador fue declarado no apto como líbero y no puede volver a jugar en este partido (regla 19.4.2.2).');

    const titulares = act.titulares.filter((t) => !t.esLibero).map((t) => t.jugadorId);
    const delSet = act.sustituciones.filter((s) => !s.porLibero && !s.nuevoLibero);
    // la jugadora que salió por un cambio excepcional no vuelve en todo el partido (no solo en ese set)
    const delPartido = todasLasSustituciones(est).filter((s) => !s.porLibero && s.excepcional);
    const regulares = delSet.filter((s) => !s.excepcional);
    const previas = [...delSet, ...delPartido.filter((e) => !delSet.some((s) => s.id === e.id))];
    // Quien entra en un cambio excepcional ocupa el lugar de la lesionada: cuenta como parte de la línea titular.
    const titularesIds = [...titulares, ...delSet.filter((s) => s.excepcional).map((s) => s.jugadorEntraId)];

    if (excepcional) {
      const error = errorCambioExcepcional({
        salidaId: saleId,
        entraId,
        titularesIds,
        previas,
        regularesUsadas: regulares.length,
        idsLibero: d.idsLibero,
        reemplazadasPorLibero: [...d.reemplazados.values()],
      });
      if (error) fallo(error);
    } else {
      if (regulares.length >= MAX_SUSTITUCIONES) {
        fallo('Ya se registraron 6 sustituciones en este set — es el máximo permitido por equipo (las entradas y salidas del líbero no cuentan). Si una jugadora se lesionó, usa el cambio excepcional.');
      }
      const error = errorReingreso({ salidaId: saleId, entraId, titularesIds, previas });
      if (error) fallo(error);
    }

    const nueva = {
      id: nuevoId(est),
      jugadorSaleId: saleId,
      jugadorEntraId: entraId,
      porLibero: false,
      excepcional: Boolean(excepcional),
      nuevoLibero: false,
      puntosLocal: act.puntosLocal,
      puntosVisitante: act.puntosVisitante,
      creado_en: ahoraISO(ctx),
    };
    act.sustituciones.push(nueva);
    act.slots = act.slots.map((jid) => (jid === saleId ? entraId : jid));
    registrarAccion(act, {
      tipo: 'sustitucion',
      sub: nueva,
      saleId,
      entraId,
      texto: `${excepcional ? 'Cambio excepcional' : 'Cambio'}: entra ${d.nombre(entraId)} por ${d.nombre(saleId)}`,
    });
    return nueva;
  });
}

// ─────────────────────────── Marcador y rotación ───────────────────────────

function cambiarPuntos(act, lado, delta) {
  if (lado === 'local') act.puntosLocal = Math.max(0, act.puntosLocal + delta);
  else act.puntosVisitante = Math.max(0, act.puntosVisitante + delta);
}

// Rotación reglamentaria: +1 avanza una rotación, -1 la deshace. Si la rotación lleva a un líbero a P1 o a la delantera, sale solo.
export function rotarCancha(est, ctx, pasos, { registrar = true, puntos = null } = {}) {
  return transaccion(est, () => {
    const act = est.actual;
    const enCancha = act.slots.filter((id) => id != null);
    if (enCancha.length < 6) return null;
    act.rotaciones = (((act.rotaciones + pasos) % 6) + 6) % 6;
    act.slots = rotar(act.slots, pasos);
    const subs = [];
    const idsLibero = derivados(est, ctx).idsLibero;
    for (const idLib of idsLibero) {
      const indice = act.slots.indexOf(idLib);
      if (indice >= 0 && (indice === 0 || !INDICES_LIBERO.includes(indice))) {
        subs.push(salirLibero(est, ctx, idLib, { avisar: true, puntos }));
      }
    }
    // Si la rotación viene de un punto, quien la llama la guarda dentro de la entrada del punto (un solo "Deshacer").
    if (!registrar) return { pasos, subs };
    registrarAccion(act, { tipo: 'rotacion', pasos, subs, texto: pasos > 0 ? 'Rotación' : 'Rotación hacia atrás' });
    return { pasos, subs };
  });
}

// Rotar a mano es recuperar el saque: si estaba marcado el rival, pasa a nuestro equipo.
export function rotarAMano(est, ctx, pasos) {
  return transaccion(est, () => {
    const act = est.actual;
    if (pasos > 0 && derivados(est, ctx).sacamos === false) act.saca = est.ladoPropio;
    return rotarCancha(est, ctx, pasos);
  });
}

// Punto con la rotación reglamentaria: si anota quien NO tenía el saque, lo recupera (y si es nuestro equipo, rota);
// si anota quien ya sacaba, solo suma. Todo queda en una sola entrada para que "Deshacer" lo revierta junto.
export function sumarPunto(est, ctx, lado, nombresEquipos = {}) {
  return transaccion(est, () => {
    const act = est.actual;
    const siguiendoSaque = act.plantillaConfirmada && act.slots.filter((id) => id != null).length === 6;
    if (siguiendoSaque && act.saca == null) fallo('Elige primero quién saca, para que la rotación siga el marcador.');
    const sacabaAntes = act.saca;
    let rotacion = null;
    cambiarPuntos(act, lado, 1);
    if (siguiendoSaque && lado !== sacabaAntes) {
      act.saca = lado;
      if (lado === est.ladoPropio) {
        rotacion = rotarCancha(est, ctx, 1, { registrar: false, puntos: { local: act.puntosLocal, visitante: act.puntosVisitante } });
      }
    }
    const nombre = nombresEquipos[lado] ?? (lado === 'local' ? 'Local' : 'Visitante');
    registrarAccion(act, { tipo: 'punto', lado, sacabaAntes, rotacion, texto: `Punto de ${nombre}${rotacion ? ' (rotó)' : ''}` });
  });
}

export function restarPunto(est, ctx, lado, nombresEquipos = {}) {
  const act = est.actual;
  // Si el último movimiento fue un punto de ese mismo equipo, quitarlo equivale a deshacerlo (también la rotación y el saque).
  const ultima = act.historial.at(-1);
  if (ultima?.tipo === 'punto' && ultima.lado === lado) return deshacerUltimaAccion(est, ctx);
  if ((lado === 'local' ? act.puntosLocal : act.puntosVisitante) === 0) return null;
  cambiarPuntos(act, lado, -1);
  const nombre = nombresEquipos[lado] ?? (lado === 'local' ? 'Local' : 'Visitante');
  registrarAccion(act, { tipo: 'resta', lado, texto: `Resta a ${nombre}` });
  return null;
}

// ─────────────────────────── Jugadas ───────────────────────────

export function registrarJugada(est, ctx, jugadorId, fundamento, calificacion, { bloqueoEnConjunto = false, paseRecibido = null } = {}) {
  return transaccion(est, () => {
    const act = est.actual;
    const d = derivados(est, ctx);
    const jugador = d.jugadoresPorId.get(jugadorId);
    if (!jugador) fallo('Ese jugador no está en la plantilla de este torneo.');
    const permitidos = fundamentosPermitidos(jugador, { esLibero: d.esLiberoId(jugadorId) });
    if (!permitidos.includes(fundamento)) {
      fallo(d.esLiberoId(jugadorId) && (fundamento === 'Saque' || fundamento === 'Bloqueo')
        ? `El líbero no puede ${fundamento === 'Saque' ? 'sacar' : 'bloquear'} (regla 19.3.1.3): no se le registra ${fundamento.toLowerCase()}.`
        : `A un jugador de la posición ${d.esLiberoId(jugadorId) ? 'Líbero' : posicionNeutra(jugador.posicion)} no se le registra ${fundamento.toLowerCase()}; solo: ${permitidos.join(', ').toLowerCase()}.`);
    }
    if (!['doble_positivo', 'positivo', 'negativo', 'error'].includes(calificacion)) fallo('Elige una calificación.');
    // Si saca alguien que no está en P1 mientras sacamos, la formación no sigue la rotación: se avisa (sin bloquear la jugada).
    if (fundamento === 'Saque' && act.plantillaConfirmada && d.sacamos === true) {
      const aviso = avisoSacadorFueraDeRotacion({ sacadorId: jugadorId, esperadoP1Id: act.slots[0] }, d.nombre);
      if (aviso) ctx.avisar?.('posicion', aviso);
    }
    const nuevo = {
      id: nuevoId(est),
      jugadorId,
      fundamento,
      calificacion,
      enConjunto: fundamento === 'Bloqueo' && calificacion === 'doble_positivo' && Boolean(bloqueoEnConjunto),
      paseRecibido: fundamento === 'Colocación' ? paseRecibido ?? null : null,
      creado_en: ahoraISO(ctx),
    };
    act.eventos.push(nuevo);
    registrarAccion(act, { tipo: 'jugada', id: nuevo.id, texto: `${fundamento} de ${jugador.nombre}` });
    return nuevo;
  });
}

export function deshacerUltimaJugada(est) {
  const act = est.actual;
  const ultimo = act.eventos.at(-1);
  if (!ultimo) return;
  act.eventos = act.eventos.slice(0, -1);
  act.historial = act.historial.filter((a) => !(a.tipo === 'jugada' && a.id === ultimo.id));
}

// ─────────────────────────── Deshacer ───────────────────────────

function revertirSustitucion(act, { sub, saleId, entraId }) {
  act.sustituciones = act.sustituciones.filter((x) => x.id !== sub.id);
  act.slots = act.slots.map((jid) => (jid === entraId ? saleId : jid));
}

// Deshace una rotación: primero los líberos que salieron solos por ella, luego la rotación en sí.
function revertirRotacion(act, { pasos, subs }) {
  [...subs].reverse().forEach((s) => revertirSustitucion(act, s));
  act.rotaciones = (((act.rotaciones - pasos) % 6) + 6) % 6;
  act.slots = rotar(act.slots, -pasos);
}

// Deshace la última acción registrada, sea cual sea: punto, resta, jugada, cambio, líbero o rotación.
export function deshacerUltimaAccion(est) {
  const act = est.actual;
  const ultima = act.historial.at(-1);
  if (!ultima) return null;
  if (ultima.tipo === 'punto') {
    if (ultima.rotacion) revertirRotacion(act, ultima.rotacion);
    cambiarPuntos(act, ultima.lado, -1);
    act.saca = ultima.sacabaAntes ?? null;
  } else if (ultima.tipo === 'resta') {
    cambiarPuntos(act, ultima.lado, 1);
  } else if (ultima.tipo === 'jugada') {
    act.eventos = act.eventos.filter((e) => e.id !== ultima.id);
  } else if (ultima.tipo === 'sustitucion') {
    revertirSustitucion(act, ultima);
  } else if (ultima.tipo === 'nuevoLibero') {
    // El líbero anterior vuelve a su cupo y se borra la designación.
    act.sustituciones = act.sustituciones.filter((x) => x.id !== ultima.sub.id);
    act.liberos[ultima.clave] = ultima.lesionadoId;
    act.titulares.forEach((t) => {
      if (t.esLibero && t.jugadorId === ultima.nuevoId) t.jugadorId = ultima.lesionadoId;
    });
  } else if (ultima.tipo === 'rotacion') {
    revertirRotacion(act, ultima);
  }
  act.historial = act.historial.slice(0, -1);
  return ultima;
}

// ─────────────────────────── Sets y partido ───────────────────────────

// Marcador sugerido para cerrar el set: el que va en pantalla.
export function guardarSet(est, ctx, puntosLocal, puntosVisitante) {
  return transaccion(est, () => {
    if (!est.formatoSets) fallo('Define primero el formato del partido (mejor de 3 o mejor de 5) antes de guardar sets.');
    const { totalSets, setsParaGanar } = formatoDeSets(est.formatoSets);
    const numeroSet = est.sets.length + 1;
    const existentes = est.sets.map((s) => ({ numeroSet: s.numeroSet, puntosLocal: s.puntosLocal, puntosVisitante: s.puntosVisitante }));
    const error =
      errorMarcadorSet({ numeroSet, totalSets, puntosLocal, puntosVisitante }) ||
      errorOrdenSet({ numeroSet, existentes, setsParaGanar });
    if (error) fallo(error);

    const act = est.actual;
    const d = derivados(est, ctx);
    est.sets.push({
      numeroSet,
      puntosLocal: Number(puntosLocal),
      puntosVisitante: Number(puntosVisitante),
      titulares: act.titulares,
      sustituciones: act.sustituciones,
      eventos: act.eventos,
      tiemposMuertos: { ...act.tiemposMuertos },
      // Cómo quedó la cancha al cerrar el set: sirve para reabrirlo exactamente como estaba (no viaja a Roots).
      cierre: { slots: [...act.slots], rotaciones: act.rotaciones, saca: act.saca, primerSaque: act.primerSaque },
    });

    // El set nuevo empieza sin plantilla confirmada, para poder armar (o repetir) la línea titular de ese set.
    const siguiente = nuevoSetEnCurso({ modoLibero: act.modoLibero, liberos: act.liberos, slots: slotsSinLiberos(act, d) });
    // El primer saque se alterna set a set; en el set decisivo se sortea, así que se deja sin elegir.
    const primero = act.primerSaque;
    const propuesto = primero == null || numeroSet + 1 >= totalSets ? null : primero === 'local' ? 'visitante' : 'local';
    siguiente.saca = propuesto;
    siguiente.primerSaque = propuesto;
    est.actual = siguiente;
  });
}

export function terminarPartido(est) {
  if (est.sets.length === 0) fallo('Registra al menos un set antes de terminar el partido.');
  est.finalizado = true;
}

export function reabrirPartido(est) {
  est.finalizado = false;
}

export function estaTerminado(est) {
  return est.finalizado || partidoDecidido(est);
}


// ─────────────────────────── Corregir lo ya guardado ───────────────────────────

// Cambia el marcador de un set ya guardado. Se revisa toda la secuencia de sets (cada marcador válido, en orden,
// y que el partido no quede decidido antes del último set).
export function corregirMarcadorSet(est, numeroSet, puntosLocal, puntosVisitante) {
  return transaccion(est, () => {
    const indice = est.sets.findIndex((s) => s.numeroSet === numeroSet);
    if (indice < 0) fallo('Ese set no está guardado.');
    const { totalSets, setsParaGanar } = formatoDeSets(est.formatoSets);
    est.sets[indice].puntosLocal = Number(puntosLocal);
    est.sets[indice].puntosVisitante = Number(puntosVisitante);
    est.sets.forEach((s, i) => {
      const error =
        errorMarcadorSet({ numeroSet: s.numeroSet, totalSets, puntosLocal: s.puntosLocal, puntosVisitante: s.puntosVisitante }) ||
        errorOrdenSet({ numeroSet: s.numeroSet, existentes: est.sets.slice(0, i).map((x) => ({ numeroSet: x.numeroSet, puntosLocal: x.puntosLocal, puntosVisitante: x.puntosVisitante })), setsParaGanar });
      if (error) fallo(`Set ${s.numeroSet}: ${error}`);
    });
  });
}

// ¿Se puede devolver este set con su rotación y saque exactos? Solo si se guardó con el cierre y la cancha estaba completa.
export function cierreExactoDelSet(set) {
  const c = set?.cierre;
  return Boolean(c && Array.isArray(c.slots) && c.slots.length === 6 && c.slots.every((id) => id != null) && Number.isInteger(c.rotaciones));
}

// Vuelve a abrir el último set guardado para seguir anotándolo (jugadas, cambios, tiempos muertos, rotación y saque se conservan).
// Los sets guardados con una versión anterior no traen el cierre: ahí la formación vuelve a la inicial más los cambios,
// y se ajusta con "Rotar". Devuelve { exacta, rotaciones, saca } para que la pantalla lo cuente.
export function reabrirUltimoSet(est) {
  return transaccion(est, () => {
    const ultimo = est.sets.at(-1);
    if (!ultimo) fallo('No hay sets guardados para reabrir.');
    const a = est.actual;
    if (a.puntosLocal + a.puntosVisitante > 0 || a.eventos.length > 0 || a.sustituciones.length > 0) {
      fallo('El set que sigue ya tiene datos. Termínalo o quítalo antes de reabrir el anterior.');
    }
    est.sets.pop();
    est.finalizado = false;
    const nuevo = nuevoSetEnCurso();
    const liberosFilas = ultimo.titulares.filter((t) => t.esLibero);
    nuevo.modoLibero = ['ninguno', 'uno', 'dos'][Math.min(2, liberosFilas.length)];
    liberosFilas.forEach((t) => { nuevo.liberos[t.tipoLibero] = t.jugadorId; });
    nuevo.puntosLocal = ultimo.puntosLocal;
    nuevo.puntosVisitante = ultimo.puntosVisitante;
    nuevo.tiemposMuertos = { ...ultimo.tiemposMuertos };
    nuevo.titulares = ultimo.titulares;
    nuevo.sustituciones = ultimo.sustituciones;
    nuevo.eventos = ultimo.eventos;
    nuevo.slots = aplicarSustituciones(slotsDesdeTitulares(ultimo.titulares.filter((t) => !t.esLibero)), ultimo.sustituciones.filter((s) => !s.nuevoLibero));
    nuevo.plantillaConfirmada = ultimo.titulares.length > 0;
    nuevo.saca = null; // sin cierre guardado (set antiguo) el saque se vuelve a elegir
    nuevo.primerSaque = null;
    const exacta = nuevo.plantillaConfirmada && cierreExactoDelSet(ultimo);
    if (exacta) {
      nuevo.slots = [...ultimo.cierre.slots];
      nuevo.rotaciones = ultimo.cierre.rotaciones;
      nuevo.saca = ultimo.cierre.saca ?? null;
      nuevo.primerSaque = ultimo.cierre.primerSaque ?? null;
    }
    nuevo.cambioCanchaHecho = true; // el aviso de cambio de cancha ya pasó
    est.actual = nuevo;
    return { exacta, rotaciones: nuevo.rotaciones, saca: nuevo.saca };
  });
}

// ─────────────────────────── Estado guardado ───────────────────────────

// Vuelve a dejar un estado leído del almacenamiento en una forma segura (por si se guardó con una versión anterior).
export function normalizarEstado(est) {
  if (!est || typeof est !== 'object' || est.version !== VERSION_ESTADO || !est.actual) return null;
  return est;
}
