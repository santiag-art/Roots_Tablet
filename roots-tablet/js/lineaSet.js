// Línea del set: la diferencia de puntos (nuestro equipo menos el rival) punto a punto, para ver dónde se cayó el set.
// Funciones puras: lineaDelSet calcula los datos y svgLineaDelSet dibuja la gráfica como texto SVG (solo números adentro).

// puntosSeq: quién anotó cada punto, en orden ('local' | 'visitante'). Arriba del cero vamos ganando.
export function lineaDelSet(puntosSeq = [], ladoPropio = 'local') {
  const diffs = [0];
  const marcador = [[0, 0]]; // [nuestros, del rival] después de cada punto (el primero es 0-0)
  let a = 0;
  let b = 0;
  for (const lado of puntosSeq) {
    if (lado === ladoPropio) a += 1;
    else b += 1;
    diffs.push(a - b);
    marcador.push([a, b]);
  }
  // La racha más larga de un equipo: { largo, desde, hasta } con índices de `marcador` (desde = antes del primer punto de la racha).
  const mejorRacha = (esDelEquipo) => {
    let mejor = null;
    let i = 0;
    while (i < puntosSeq.length) {
      if (!esDelEquipo(puntosSeq[i])) { i += 1; continue; }
      let j = i;
      while (j < puntosSeq.length && esDelEquipo(puntosSeq[j])) j += 1;
      if (!mejor || j - i > mejor.largo) mejor = { largo: j - i, desde: i, hasta: j };
      i = j;
    }
    return mejor;
  };
  const max = Math.max(...diffs);
  const min = Math.min(...diffs);
  const conMarcador = (indice) => ({ indice, marcador: marcador[indice] });
  return {
    n: puntosSeq.length,
    diffs,
    marcador,
    final: marcador.at(-1),
    ventaja: max > 0 ? { valor: max, ...conMarcador(diffs.indexOf(max)) } : null,
    desventaja: min < 0 ? { valor: min, ...conMarcador(diffs.indexOf(min)) } : null,
    rachaRival: mejorRacha((l) => l !== ladoPropio),
    rachaPropia: mejorRacha((l) => l === ladoPropio),
  };
}

const num = (x) => Math.round(x * 10) / 10;

// `id` hace únicos los recortes cuando hay varias gráficas en la misma pantalla.
export function svgLineaDelSet(linea, { id = 'ls', ancho = 640, alto = 220 } = {}) {
  if (!linea || linea.n === 0) return '';
  const izq = 40;
  const der = 14;
  const arriba = 14;
  const abajo = 30;
  const w = ancho - izq - der;
  const hh = alto - arriba - abajo;
  const maxAbs = Math.max(5, Math.ceil(Math.max(...linea.diffs.map(Math.abs)) / 5) * 5);
  const x = (i) => izq + (i / linea.n) * w;
  const y = (d) => arriba + hh / 2 - (d / maxAbs) * (hh / 2);
  const cero = y(0);
  const puntos = linea.diffs.map((d, i) => `${num(x(i))},${num(y(d))}`);
  const area = `M${num(x(0))},${num(cero)} L${puntos.join(' L')} L${num(x(linea.n))},${num(cero)} Z`;
  const racha = linea.rachaRival && linea.rachaRival.largo >= 3 ? linea.diffs.slice(linea.rachaRival.desde, linea.rachaRival.hasta + 1).map((d, k) => `${num(x(linea.rachaRival.desde + k))},${num(y(d))}`).join(' ') : '';
  const etiquetaY = (d, texto) => `<text class="ls-eje" x="${izq - 6}" y="${num(y(d) + 4)}" text-anchor="end">${texto}</text>`;
  const medio = Math.round(linea.n / 2);
  const fin = linea.diffs.at(-1);
  return [
    `<svg class="ls-svg" viewBox="0 0 ${ancho} ${alto}" role="img" aria-label="Diferencia de puntos a lo largo del set" preserveAspectRatio="xMidYMid meet">`,
    `<defs><clipPath id="${id}-arriba"><rect x="${izq}" y="${arriba}" width="${w}" height="${num(cero - arriba)}"/></clipPath><clipPath id="${id}-abajo"><rect x="${izq}" y="${num(cero)}" width="${w}" height="${num(arriba + hh - cero)}"/></clipPath></defs>`,
    `<line class="ls-rejilla" x1="${izq}" x2="${izq + w}" y1="${num(y(maxAbs))}" y2="${num(y(maxAbs))}"/>`,
    `<line class="ls-rejilla" x1="${izq}" x2="${izq + w}" y1="${num(y(-maxAbs))}" y2="${num(y(-maxAbs))}"/>`,
    `<path class="ls-area-pos" d="${area}" clip-path="url(#${id}-arriba)"/>`,
    `<path class="ls-area-neg" d="${area}" clip-path="url(#${id}-abajo)"/>`,
    `<line class="ls-cero" x1="${izq}" x2="${izq + w}" y1="${num(cero)}" y2="${num(cero)}"/>`,
    `<polyline class="ls-linea" points="${puntos.join(' ')}"/>`,
    racha ? `<polyline class="ls-racha" points="${racha}"/>` : '',
    `<circle class="ls-fin ${fin < 0 ? 'neg' : fin > 0 ? 'pos' : ''}" cx="${num(x(linea.n))}" cy="${num(y(fin))}" r="5"/>`,
    etiquetaY(maxAbs, `+${maxAbs}`),
    etiquetaY(0, '0'),
    etiquetaY(-maxAbs, `−${maxAbs}`),
    `<text class="ls-eje" x="${izq}" y="${alto - 8}" text-anchor="start">0</text>`,
    medio > 0 && medio < linea.n ? `<text class="ls-eje" x="${num(x(medio))}" y="${alto - 8}" text-anchor="middle">${medio}</text>` : '',
    `<text class="ls-eje" x="${izq + w}" y="${alto - 8}" text-anchor="end">${linea.n} puntos</text>`,
    '</svg>',
  ].join('');
}
