// Cómo anota el rival: al sumarle un punto se puede anotar el motivo (ataque, saque directo, bloqueo o error nuestro) y,
// si fue un ataque, de qué zona salió y en qué zona de nuestra cancha cayó. Sirve para preparar la defensa contra ese rival.
// Funciones puras (sin pantalla); el detalle de cada punto vive en `puntosInfo[i].detalle` del set (ver motor.js).
//
// Zonas: numeración de siempre, mirando hacia la red. Delanteras 4-3-2 (izquierda a derecha) y zagueras 5-6-1.
// "Desde" es la zona del rival (como la ve su equipo); "hacia" es la zona de NUESTRA cancha donde cayó la pelota.

export const MOTIVOS_RIVAL = [
  { id: 'ataque', texto: 'Ataque', ayuda: 'Remate o dejada' },
  { id: 'saque', texto: 'Saque directo', ayuda: 'Ace' },
  { id: 'bloqueo', texto: 'Bloqueo', ayuda: 'Nos bloquearon' },
  { id: 'error', texto: 'Error nuestro', ayuda: 'Fallamos nosotras' },
];
const IDS_MOTIVO = MOTIVOS_RIVAL.map((m) => m.id);

// Zonas desde las que se anota un ataque del rival (la 5 no se usa por ahora: agrégala aquí si la quieres).
export const ZONAS_ATAQUE = [4, 3, 2, 6, 1];
export const ZONAS_CAIDA = [1, 2, 3, 4, 5, 6];

const zonaValida = (z, permitidas) => (permitidas.includes(Number(z)) ? Number(z) : null);

// Deja el detalle en su forma guardada, o null si no trae un motivo válido. Las zonas solo valen en los ataques.
export function limpiarDetalle(entrada) {
  const motivo = entrada?.motivo;
  if (!IDS_MOTIVO.includes(motivo)) return null;
  if (motivo !== 'ataque') return { motivo };
  const desde = zonaValida(entrada.desde, ZONAS_ATAQUE);
  const hacia = zonaValida(entrada.hacia, ZONAS_CAIDA);
  return { motivo, ...(desde != null ? { desde } : {}), ...(hacia != null ? { hacia } : {}) };
}

// ── Preferencia: preguntar el detalle cada vez que el rival anota (viene activado) ──
const CLAVE = 'roots-detalle-rival';

export function detalleRivalActivado(almacen = globalThis.localStorage) {
  try {
    return JSON.parse(almacen.getItem(CLAVE) ?? '{}').activo !== false;
  } catch {
    return true;
  }
}

export function guardarDetalleRivalActivado(activo, almacen = globalThis.localStorage) {
  try {
    almacen.setItem(CLAVE, JSON.stringify({ activo: activo !== false }));
  } catch {
    /* sin almacenamiento local: vale solo para esta sesión */
  }
}

// ── Resumen ──
const mapaZonas = () => Object.fromEntries(ZONAS_CAIDA.map((z) => [z, 0]));

export function resumenVacio() {
  return {
    total: 0,
    conDetalle: 0,
    sinDetalle: 0,
    motivos: Object.fromEntries(IDS_MOTIVO.map((id) => [id, 0])),
    ataques: { total: 0, conOrigen: 0, conDestino: 0, desde: mapaZonas(), hacia: mapaZonas(), cruces: new Map() },
  };
}

// sets: sets guardados o el que está en juego ({ puntosSeq, puntosInfo }). Cuenta solo los puntos del rival.
export function resumenPuntosRival(sets, ladoPropio) {
  const r = resumenVacio();
  for (const set of sets) {
    (set.puntosSeq ?? []).forEach((lado, i) => {
      if (lado === ladoPropio) return;
      r.total += 1;
      const d = limpiarDetalle(set.puntosInfo?.[i]?.detalle);
      if (!d) {
        r.sinDetalle += 1;
        return;
      }
      r.conDetalle += 1;
      r.motivos[d.motivo] += 1;
      if (d.motivo !== 'ataque') return;
      r.ataques.total += 1;
      if (d.desde != null) { r.ataques.conOrigen += 1; r.ataques.desde[d.desde] += 1; }
      if (d.hacia != null) { r.ataques.conDestino += 1; r.ataques.hacia[d.hacia] += 1; }
      if (d.desde != null && d.hacia != null) {
        const clave = `${d.desde}>${d.hacia}`;
        r.ataques.cruces.set(clave, (r.ataques.cruces.get(clave) ?? 0) + 1);
      }
    });
  }
  return r;
}

export function combinarResumenes(lista) {
  const r = resumenVacio();
  for (const x of lista) {
    r.total += x.total;
    r.conDetalle += x.conDetalle;
    r.sinDetalle += x.sinDetalle;
    IDS_MOTIVO.forEach((id) => { r.motivos[id] += x.motivos[id]; });
    r.ataques.total += x.ataques.total;
    r.ataques.conOrigen += x.ataques.conOrigen;
    r.ataques.conDestino += x.ataques.conDestino;
    ZONAS_CAIDA.forEach((z) => { r.ataques.desde[z] += x.ataques.desde[z]; r.ataques.hacia[z] += x.ataques.hacia[z]; });
    for (const [clave, n] of x.ataques.cruces) r.ataques.cruces.set(clave, (r.ataques.cruces.get(clave) ?? 0) + n);
  }
  return r;
}

// Sets que cuentan según el alcance de la pantalla: 'todo', 'actual' o el número de un set guardado.
export function setsDelAlcance(est, alcance = 'todo') {
  if (alcance === 'todo') return [...est.sets, est.actual];
  if (alcance === 'actual') return [est.actual];
  return est.sets.filter((s) => s.numeroSet === alcance);
}

export const resumenPuntosRivalDePartido = (est, alcance = 'todo') => resumenPuntosRival(setsDelAlcance(est, alcance), est.ladoPropio);

// Nombre del rival de un partido (el equipo que no es el nuestro).
export const rivalDeRegistro = (registro) => (registro.est.ladoPropio === 'local' ? registro.equipoVisitante : registro.equipoLocal);

// Todos los partidos guardados contra un mismo rival (el nombre se compara sin tildes ni mayúsculas con `normalizar`).
export function resumenContraRival(registros, nombreRival, normalizar = (n) => String(n ?? '').trim().toLowerCase()) {
  const clave = normalizar(nombreRival);
  const delRival = registros.filter((r) => r.est && normalizar(rivalDeRegistro(r)) === clave);
  return { partidos: delRival.length, resumen: combinarResumenes(delRival.map((r) => resumenPuntosRivalDePartido(r.est, 'todo'))) };
}

// Cruces ordenados de mayor a menor: [{ desde, hacia, n }].
export function crucesOrdenados(resumen, max = 5) {
  return [...resumen.ataques.cruces]
    .map(([clave, n]) => { const [desde, hacia] = clave.split('>').map(Number); return { desde, hacia, n }; })
    .sort((a, b) => b.n - a.n || a.desde - b.desde || a.hacia - b.hacia)
    .slice(0, max);
}

// La(s) zona(s) con más ataques de un mapa { zona: n }: { zonas: [4], n: 5 } o null si no hay datos.
export function zonaMasUsada(mapa) {
  const n = Math.max(0, ...Object.values(mapa));
  if (n === 0) return null;
  return { zonas: ZONAS_CAIDA.filter((z) => mapa[z] === n), n };
}

const lista = (zonas) => (zonas.length === 1 ? `la zona ${zonas[0]}` : `las zonas ${zonas.slice(0, -1).join(', ')} y ${zonas.at(-1)}`);

// Frases cortas para leer de un vistazo. Solo habla de lo que hay datos.
export function frasesDelRival(resumen, nombre = 'El rival') {
  const frases = [];
  if (resumen.conDetalle > 0) {
    const [id, n] = Object.entries(resumen.motivos).sort((a, b) => b[1] - a[1])[0];
    const texto = { ataque: 'por ataque', saque: 'con saque directo', bloqueo: 'con bloqueo', error: 'por errores nuestros' }[id];
    frases.push(`${nombre} anota sobre todo ${texto} (${n} de ${resumen.conDetalle}).`);
  }
  const origen = zonaMasUsada(resumen.ataques.desde);
  if (origen) frases.push(`Ataca más desde ${lista(origen.zonas)} (${origen.n} de ${resumen.ataques.conOrigen}).`);
  const destino = zonaMasUsada(resumen.ataques.hacia);
  if (destino) frases.push(`La pelota cae más en ${lista(destino.zonas)} de nuestra cancha (${destino.n} de ${resumen.ataques.conDestino}).`);
  return frases;
}
