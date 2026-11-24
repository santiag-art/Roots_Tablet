// Ventana "¿Cómo anotó el rival?": un toque para el motivo y, si fue un ataque, de qué zona salió y en qué zona de
// nuestra cancha cayó. Se puede cerrar con Omitir sin anotar nada (el punto ya quedó sumado).
import { detallarPuntoRival } from '../motor.js';
import { MOTIVOS_RIVAL, ZONAS_ATAQUE, ZONAS_CAIDA, crucesOrdenados, frasesDelRival } from '../puntosRival.js';
import { abrirVentana } from './aviso.js';
import { h } from './dom.js';

const FILAS = [[4, 3, 2], [5, 6, 1]]; // delanteras arriba (junto a la red), zagueras abajo

// Media cancha con sus 6 zonas. Si trae `onElegir` se puede tocar; si trae `conteos` se pinta más fuerte donde hay más.
export function canchaZonas({ titulo, subtitulo = null, elegida = null, habilitadas = ZONAS_CAIDA, onElegir = null, conteos = null, etiqueta = 'Zona' }) {
  const max = conteos ? Math.max(1, ...Object.values(conteos)) : 1;
  const celda = (z) => {
    const activa = habilitadas.includes(z);
    const n = conteos?.[z] ?? 0;
    const props = {
      class: `zona ${elegida === z ? 'elegida' : ''} ${activa ? '' : 'apagada'} ${conteos && n > 0 ? 'con-datos' : ''}`,
      style: conteos ? `--calor:${(n / max).toFixed(2)}` : null, // texto, no objeto: las variables CSS no se asignan con Object.assign
      'data-zona': String(z),
    };
    const contenido = [h('span', { class: 'zona-num' }, z), conteos ? h('span', { class: 'zona-n' }, n > 0 ? n : '·') : null];
    if (!onElegir) return h('div', { ...props, 'aria-label': `${etiqueta} ${z}${conteos ? `: ${n}` : ''}` }, contenido);
    return h('button', { ...props, type: 'button', disabled: !activa, 'aria-pressed': String(elegida === z), 'aria-label': `${etiqueta} ${z}`, onclick: () => onElegir(z) }, contenido);
  };
  return h(
    'div',
    { class: 'cancha-zonas' },
    h('div', { class: 'cz-titulo' }, h('strong', {}, titulo), subtitulo ? h('small', {}, subtitulo) : null),
    h('div', { class: 'cz-red' }, 'RED'),
    h('div', { class: 'cz-rejilla' }, FILAS.flat().map(celda))
  );
}

// Pregunta cómo anotó el rival su último punto y lo guarda junto al punto. No devuelve nada: todo pasa dentro.
export function preguntarPuntoRival(V) {
  const rival = V.nombres[V.est.ladoPropio === 'local' ? 'visitante' : 'local'];
  const sel = { motivo: null, desde: null, hacia: null };
  abrirVentana({
    titulo: `¿Cómo anotó ${rival}?`,
    subtitulo: 'Un toque. Si no quieres anotarlo, toca Omitir.',
    ancho: 'media',
    acciones: [{ texto: 'Omitir', tipo: 'fantasma' }],
    contenido: (cerrar) => {
      const raiz = h('div', { class: 'punto-rival', 'data-punto-rival': '' });
      const guardar = () => {
        V.aplicar((e) => detallarPuntoRival(e, { ...sel }));
        cerrar();
      };
      const pintar = () => {
        raiz.replaceChildren(sel.motivo === 'ataque' ? pasoZonas() : pasoMotivo());
      };
      const pasoMotivo = () =>
        h(
          'div',
          { class: 'lista-opciones dos-col' },
          MOTIVOS_RIVAL.map((m) =>
            h(
              'button',
              {
                class: 'opcion',
                'data-motivo': m.id,
                onclick: () => {
                  sel.motivo = m.id;
                  if (m.id === 'ataque') pintar();
                  else guardar();
                },
              },
              h('span', { class: 'datos' }, h('strong', {}, m.texto), h('small', {}, m.ayuda))
            )
          )
        );
      const elegir = (clave) => (z) => {
        sel[clave] = sel[clave] === z ? null : z;
        if (sel.desde != null && sel.hacia != null) guardar();
        else pintar();
      };
      const pasoZonas = () =>
        h(
          'div',
          { class: 'pasos-zonas' },
          h('div', { class: 'cz-par' },
            canchaZonas({ titulo: 'Atacó desde', subtitulo: `zona de ${rival}`, elegida: sel.desde, habilitadas: ZONAS_ATAQUE, onElegir: elegir('desde'), etiqueta: 'Desde la zona' }),
            canchaZonas({ titulo: 'Cayó en', subtitulo: 'nuestra cancha', elegida: sel.hacia, habilitadas: ZONAS_CAIDA, onElegir: elegir('hacia'), etiqueta: 'Cayó en la zona' })
          ),
          h(
            'div',
            { class: 'cz-botones' },
            h('button', { class: 'btn btn-fantasma', onclick: () => { sel.motivo = null; sel.desde = null; sel.hacia = null; pintar(); } }, 'Cambiar motivo'),
            h('button', { class: 'btn btn-primario', 'data-guardar-ataque': '', onclick: guardar }, sel.desde == null && sel.hacia == null ? 'Guardar sin zonas' : 'Guardar')
          )
        );
      pintar();
      return raiz;
    },
  });
}

// ── Mapa de calor de la cancha completa (como se ve desde nuestra banca) ──
// Arriba la cancha del rival, abajo la nuestra. Las zonas del rival se pintan según de dónde atacó y las nuestras según
// dónde cayó la pelota; las flechas son las trayectorias que más se repiten. Los números de zona son los de cada equipo
// (por eso la zona 4 del rival queda a la derecha: es su izquierda).
const ANCHO = 100;
const ALTO = 102;
const X0 = 15;
const FILAS_RIVAL = [{ y: 10, zonas: [1, 6, 5] }, { y: 112, zonas: [2, 3, 4] }]; // de arriba (fondo) a la red
const FILAS_NUESTRA = [{ y: 227, zonas: [4, 3, 2] }, { y: 329, zonas: [5, 6, 1] }]; // de la red al fondo

function centros(filas) {
  const mapa = new Map();
  filas.forEach(({ y, zonas }) => zonas.forEach((z, i) => mapa.set(z, { x: X0 + i * ANCHO, y })));
  return mapa;
}

export function mapaCalorCancha(resumen) {
  const { desde, hacia, conOrigen, conDestino } = resumen.ataques;
  const rival = centros(FILAS_RIVAL);
  const nuestra = centros(FILAS_NUESTRA);
  const maxDesde = Math.max(1, ...Object.values(desde));
  const maxHacia = Math.max(1, ...Object.values(hacia));
  const mitad = (c, z) => ({ x: c.get(z).x + ANCHO / 2, y: c.get(z).y + ALTO / 2 });
  const celdas = (mapa, conteos, max, total, color, etiqueta) =>
    [...mapa].map(([z, { x, y }]) => {
      const n = conteos[z];
      const alfa = n > 0 ? (0.18 + 0.72 * (n / max)).toFixed(2) : '0.05';
      const pct = total > 0 && n > 0 ? `${Math.round((n / total) * 100)}%` : '';
      return `<g data-zona="${z}" data-n="${n}" data-mapa="${etiqueta}"><rect x="${x + 2}" y="${y + 2}" width="${ANCHO - 4}" height="${ALTO - 4}" rx="10" fill="rgba(${color},${alfa})" stroke="rgba(${color},0.7)" stroke-width="1.5"/>`
        + `<text x="${x + 10}" y="${y + 20}" class="mc-zona">${z}</text>`
        + (n > 0 ? `<text x="${x + ANCHO / 2}" y="${y + ALTO / 2 + 6}" class="mc-n" text-anchor="middle">${n}</text><text x="${x + ANCHO / 2}" y="${y + ALTO / 2 + 28}" class="mc-pct" text-anchor="middle">${pct}</text>` : '')
        + '</g>';
    }).join('');
  const cruces = crucesOrdenados(resumen, 4);
  const maxCruce = Math.max(1, ...cruces.map((c) => c.n));
  const flechas = cruces
    .map((c) => {
      const a = mitad(rival, c.desde);
      const b = mitad(nuestra, c.hacia);
      return `<line data-cruce="${c.desde}>${c.hacia}" x1="${a.x}" y1="${a.y + ALTO / 2 - 8}" x2="${b.x}" y2="${b.y - ALTO / 2 + 18}" class="mc-flecha" stroke-width="${(2 + (c.n / maxCruce) * 4).toFixed(1)}" marker-end="url(#mc-punta)"/>`;
    })
    .join('');
  const svg = `<svg class="mapa-calor" viewBox="0 0 330 436" role="img" aria-label="Mapa de calor: de dónde ataca el rival y dónde cae la pelota en nuestra cancha" xmlns="http://www.w3.org/2000/svg">`
    + '<defs><marker id="mc-punta" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="mc-punta"/></marker></defs>'
    + celdas(rival, desde, maxDesde, conOrigen, '245,158,11', 'desde')
    + `<rect x="${X0}" y="217" width="${ANCHO * 3}" height="8" rx="3" class="mc-red"/>`
    + celdas(nuestra, hacia, maxHacia, conDestino, '12,164,164', 'hacia')
    + flechas
    + '</svg>';
  const caja = document.createElement('div');
  caja.className = 'mapa-calor-caja';
  caja.innerHTML = svg; // solo números y constantes: no lleva texto escrito por nadie
  return caja;
}

// Lo que se ve de cómo anota un rival: motivos, frases, mapa de calor y trayectorias. Lo usan el Resumen del partido y la
// pantalla del rival. `r` es un resumen de puntosRival.js.
export function bloqueDetalleRival(r, rival) {
  const barras = MOTIVOS_RIVAL.map((m) => h('div', { class: 'fila-motivo' }, h('span', { class: 'fm-nombre' }, m.texto), h('span', { class: 'fm-barra' }, h('span', { style: { width: `${r.conDetalle ? Math.round((r.motivos[m.id] / r.conDetalle) * 100) : 0}%` } })), h('strong', { class: 'fm-n' }, r.motivos[m.id])));
  const frases = frasesDelRival(r, rival);
  const cruces = crucesOrdenados(r);
  return h(
    'div',
    { class: 'bloque-rival' },
    h('div', { class: 'motivos-rival' }, barras),
    r.sinDetalle > 0 ? h('p', { class: 'nota' }, `${r.sinDetalle} de ${r.total} puntos del rival sin detalle.`) : null,
    frases.length ? h('ul', { class: 'frases-rival' }, frases.map((f) => h('li', {}, f))) : null,
    r.ataques.total > 0
      ? h(
          'div',
          {},
          h('div', { class: 'titulo-grupo' }, 'Mapa de calor de sus ataques'),
          mapaCalorCancha(r),
          h('p', { class: 'nota mc-leyenda' }, h('span', { class: 'mc-ley-rival' }, 'Naranja: zona desde la que ataca'), ' · ', h('span', { class: 'mc-ley-nuestra' }, 'Verde: dónde cae en nuestra cancha'), ' · Las flechas son las trayectorias que más se repiten. Cada equipo con su numeración, por eso su zona 4 queda a la derecha.'),
          cruces.length ? h('p', { class: 'nota' }, `Trayectorias más repetidas: ${cruces.map((c) => `${c.desde} → ${c.hacia} (${c.n})`).join(' · ')}`) : null,
          h('p', { class: 'nota' }, `${r.ataques.total} ataques: ${r.ataques.conOrigen} con zona de salida y ${r.ataques.conDestino} con zona de caída.`)
        )
      : null
  );
}
