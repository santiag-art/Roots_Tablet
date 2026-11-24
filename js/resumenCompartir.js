import { CATEGORIA_LABEL, GENERO_LABEL } from './reglas/catalogos.js';

// Resumen del partido para compartir (WhatsApp, familias): el mismo de Roots, pero hecho en la tablet.
// Marcador por sets, mejores jugadoras y puntos clave. Se dibuja una sola vez en un canvas y de ahí salen la
// imagen (PNG) y el PDF, así los dos se ven idénticos. Solo se destacan cosas positivas por jugadora: los
// errores individuales no aparecen (es un mensaje para las familias, no un informe técnico).
// Las funciones de dibujo y de datos son copia fiel de las de Roots (utils/resumenPartido.js).

// "Valentina Ríos Gómez" -> "Valentina Ríos" (igual que Roots)
const nombreCorto = (nombre) => String(nombre ?? '').trim().split(/\s+/).slice(0, 2).join(' ');

const NAVY = '#050e2d';
const ARENA = '#05b2c4';
const CANCHA = '#0ca4a4';
const FONDO = '#f1f5f9';
const GRIS = '#6b7280';
const GRIS_CLARO = '#e5e7eb';
const VERDE = '#059669';
const VERDE_FONDO = '#d1fae5';
const ROJO = '#b91c1c';
const ROJO_FONDO = '#fee2e2';
const FUENTE = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const MIN_ACCIONES_DESTACADA = 3; // para destacar a alguien debe haber jugado un mínimo de acciones
const MIN_ACCIONES_EQUIPO = 5; // para opinar de un fundamento del equipo

const sumar = (...xs) => xs.reduce((a, b) => a + b, 0);

function plural(n, uno, varios) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function formatearFechaLarga(fecha) {
  if (!fecha) return '';
  const texto = new Date(`${String(fecha).slice(0, 10)}T00:00:00`).toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function conteosPorFundamento(eventos) {
  const mapa = new Map();
  for (const e of eventos) {
    if (!mapa.has(e.fundamento)) mapa.set(e.fundamento, { doble_positivo: 0, positivo: 0, negativo: 0, error: 0 });
    const c = mapa.get(e.fundamento);
    if (e.calificacion in c) c[e.calificacion] += 1;
  }
  return mapa;
}

const acciones = (c) => sumar(c.doble_positivo, c.positivo, c.negativo, c.error);
const positivas = (c) => c.doble_positivo + c.positivo;

// Convierte los datos del partido en lo que se va a mostrar. No toca el navegador (se puede probar aparte).
export function datosResumenPartido({ partido, torneo, jugadores, eventos }) {
  const esVisitante = partido.ladoPropio === 'visitante';
  const rival = esVisitante ? partido.equipoLocal : partido.equipoVisitante;
  const sets = (partido.sets ?? []).map((s) => ({
    roots: esVisitante ? s.visitante : s.local,
    rival: esVisitante ? s.local : s.visitante,
  }));
  const setsRoots = sets.filter((s) => s.roots > s.rival).length;
  const setsRival = sets.filter((s) => s.rival > s.roots).length;
  const gano = setsRoots > setsRival;

  // Jugadoras destacadas: mejor balance (positivas − negativas) con un mínimo de participación
  const porJugador = new Map();
  for (const e of eventos) {
    if (!porJugador.has(e.jugadorId)) porJugador.set(e.jugadorId, []);
    porJugador.get(e.jugadorId).push(e);
  }
  const destacadas = jugadores
    .filter((j) => porJugador.has(j.id))
    .map((j) => {
      const propios = porJugador.get(j.id);
      const porFundamento = conteosPorFundamento(propios);
      const total = sumar(...[...porFundamento.values()].map(acciones));
      const pos = sumar(...[...porFundamento.values()].map(positivas));
      const balance = pos - (total - pos);
      const fuerte = [...porFundamento.entries()].sort((a, b) => positivas(b[1]) - positivas(a[1]))[0];
      return { jugador: j, total, pos, balance, fuerte: fuerte && positivas(fuerte[1]) > 0 ? { fundamento: fuerte[0], n: positivas(fuerte[1]) } : null };
    })
    .filter((d) => d.total >= MIN_ACCIONES_DESTACADA && d.balance > 0)
    .sort((a, b) => b.balance - a.balance || b.pos - a.pos || b.total - a.total)
    .slice(0, 3)
    .map((d) => ({
      nombre: nombreCorto(d.jugador.nombre),
      numero: d.jugador.numero,
      positivas: d.pos,
      detalle: d.fuerte ? `Brilló en ${d.fuerte.fundamento.toLowerCase()}: ${plural(d.fuerte.n, 'acción positiva', 'acciones positivas')}` : '',
    }));

  // Puntos clave: se arman con lo que realmente pasó en el partido
  const claves = [];
  if (gano && sets.length > 0 && sets[0].roots < sets[0].rival) {
    claves.push('Remontada: se perdió el primer set y aun así se ganó el partido.');
  }
  if (sets.length > 1) {
    const ganados = sets.map((s, i) => ({ i, dif: s.roots - s.rival, s })).filter((x) => x.dif > 0);
    const mejor = [...ganados].sort((a, b) => b.dif - a.dif)[0];
    if (mejor && mejor.dif >= 7) claves.push(`Mejor set: el ${mejor.i + 1}.º, ganado ${mejor.s.roots}-${mejor.s.rival}.`);
    const reñido = [...sets.map((s, i) => ({ i, s, dif: Math.abs(s.roots - s.rival) }))].sort((a, b) => a.dif - b.dif)[0];
    if (reñido && reñido.dif <= 3) claves.push(`Set más peleado: el ${reñido.i + 1}.º, terminó ${reñido.s.roots}-${reñido.s.rival}.`);
  } else if (sets.length === 1) {
    claves.push(`Set único ${sets[0].roots}-${sets[0].rival}.`);
  }

  const porFund = conteosPorFundamento(eventos);
  const ataque = porFund.get('Ataque');
  if (ataque && acciones(ataque) >= MIN_ACCIONES_EQUIPO) {
    claves.push(`Ataque: ${Math.round((positivas(ataque) / acciones(ataque)) * 100)} % de efectividad (${positivas(ataque)} de ${acciones(ataque)} ataques).`);
  }
  const saque = porFund.get('Saque');
  if (saque && saque.doble_positivo > 0) {
    claves.push(`${plural(saque.doble_positivo, 'saque directo', 'saques directos')}.`);
  }
  const candidatos = [...porFund.entries()].filter(([, c]) => acciones(c) >= 8).map(([f, c]) => ({ f, pct: positivas(c) / acciones(c) }));
  if (candidatos.length >= 2) {
    candidatos.sort((a, b) => b.pct - a.pct);
    const flojo = candidatos[candidatos.length - 1];
    if (flojo.pct < 0.5) claves.push(`Para seguir mejorando en los entrenamientos: ${flojo.f.toLowerCase()}.`);
  }

  const generoTorneo = torneo?.genero;
  return {
    equipo: esVisitante ? partido.equipoVisitante : partido.equipoLocal,
    rival,
    torneo: torneo?.nombre ?? '',
    subtitulo: [GENERO_LABEL[torneo?.genero], CATEGORIA_LABEL[torneo?.categoria]].filter(Boolean).join(' · '),
    fecha: formatearFechaLarga(partido.fecha),
    sets,
    setsRoots,
    setsRival,
    gano,
    tituloDestacadas: generoTorneo === 'femenino' ? 'Mejores jugadoras' : generoTorneo === 'masculino' ? 'Mejores jugadores' : 'Jugadores destacados',
    destacadas,
    claves: claves.slice(0, 5),
    hayJugadas: eventos.length > 0,
  };
}

// ───────────── Dibujo en canvas ─────────────

function rectRedondeado(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function tarjeta(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(5, 14, 45, 0.10)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#ffffff';
  rectRedondeado(ctx, x, y, w, h, 28);
  ctx.fill();
  ctx.restore();
}

// Reduce el tamaño de letra hasta que el texto quepa en el ancho dado.
function textoAjustado(ctx, texto, x, y, anchoMax, { tam, peso = 'bold', color, alinear = 'left' }) {
  let t = tam;
  ctx.font = `${peso} ${t}px ${FUENTE}`;
  while (ctx.measureText(texto).width > anchoMax && t > 18) {
    t -= 2;
    ctx.font = `${peso} ${t}px ${FUENTE}`;
  }
  ctx.fillStyle = color;
  ctx.textAlign = alinear;
  ctx.fillText(texto, x, y);
}

// Escribe un párrafo en varias líneas; devuelve la altura que ocupó.
function parrafo(ctx, texto, x, y, anchoMax, alturaLinea) {
  const palabras = texto.split(' ');
  let linea = '';
  let lineas = 0;
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > anchoMax && linea) {
      ctx.fillText(linea, x, y + lineas * alturaLinea);
      linea = p;
      lineas += 1;
    } else {
      linea = prueba;
    }
  }
  ctx.fillText(linea, x, y + lineas * alturaLinea);
  return (lineas + 1) * alturaLinea;
}

function alturaParrafo(ctx, texto, anchoMax, alturaLinea) {
  const palabras = texto.split(' ');
  let linea = '';
  let lineas = 1;
  for (const p of palabras) {
    const prueba = linea ? `${linea} ${p}` : p;
    if (ctx.measureText(prueba).width > anchoMax && linea) {
      linea = p;
      lineas += 1;
    } else {
      linea = prueba;
    }
  }
  return lineas * alturaLinea;
}

// Nombre del equipo sobre el marcador: una línea si cabe; si no, se parte en dos (nunca se sale de la tarjeta).
function nombreEquipo(ctx, texto, cx, y, anchoMax) {
  ctx.textAlign = 'center';
  ctx.fillStyle = NAVY;
  const mayus = texto.toUpperCase();
  ctx.font = `bold 36px ${FUENTE}`;
  if (ctx.measureText(mayus).width <= anchoMax) {
    ctx.fillText(mayus, cx, y);
    return;
  }
  ctx.font = `bold 28px ${FUENTE}`;
  const palabras = mayus.split(' ');
  let mejor = null;
  for (let i = 1; i < palabras.length; i += 1) {
    const a = palabras.slice(0, i).join(' ');
    const b = palabras.slice(i).join(' ');
    const peor = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
    if (!mejor || peor < mejor.peor) mejor = { a, b, peor };
  }
  if (!mejor) {
    textoAjustado(ctx, mayus, cx, y, anchoMax, { tam: 28, color: NAVY, alinear: 'center' });
    return;
  }
  textoAjustado(ctx, mejor.a, cx, y - 16, anchoMax, { tam: 28, color: NAVY, alinear: 'center' });
  textoAjustado(ctx, mejor.b, cx, y + 20, anchoMax, { tam: 28, color: NAVY, alinear: 'center' });
}

const ANCHO = 1080;
const MARGEN = 50;

// Dibuja el resumen y devuelve un canvas recortado a la altura real.
export function dibujarResumen(datos, logo = null, crearCanvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h })) {
  const lienzo = crearCanvas(ANCHO, 2600);
  const ctx = lienzo.getContext('2d');
  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, ANCHO, 2600);

  // Encabezado
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 0, ANCHO, 250);
  ctx.fillStyle = ARENA;
  ctx.fillRect(0, 250, ANCHO, 8);
  let xTexto = MARGEN;
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(MARGEN + 60, 125, 60, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, MARGEN, 65, 120, 120);
    ctx.restore();
    xTexto = MARGEN + 150;
  }
  ctx.textBaseline = 'alphabetic';
  textoAjustado(ctx, 'Roots · Club de Voleibol', xTexto, 92, ANCHO - xTexto - MARGEN, { tam: 38, color: '#ffffff' });
  textoAjustado(ctx, datos.torneo || 'Resumen del partido', xTexto, 150, ANCHO - xTexto - MARGEN, { tam: 34, peso: 'normal', color: ARENA });
  textoAjustado(ctx, [datos.subtitulo, datos.fecha].filter(Boolean).join('  ·  '), xTexto, 200, ANCHO - xTexto - MARGEN, { tam: 28, peso: 'normal', color: '#c7d2e8' });

  // Marcador
  let y = 290;
  const altoMarcador = 430;
  tarjeta(ctx, MARGEN, y, ANCHO - 2 * MARGEN, altoMarcador);
  const mitad = ANCHO / 2;
  nombreEquipo(ctx, datos.equipo, 240, y + 70, 380);
  nombreEquipo(ctx, datos.rival, 840, y + 70, 380);
  ctx.font = `bold 170px ${FUENTE}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = datos.gano ? CANCHA : NAVY;
  ctx.fillText(String(datos.setsRoots), 240, y + 235);
  ctx.fillStyle = datos.gano ? NAVY : CANCHA;
  ctx.fillText(String(datos.setsRival), 840, y + 235);
  ctx.fillStyle = '#9ca3af';
  ctx.font = `bold 90px ${FUENTE}`;
  ctx.fillText('-', mitad, y + 215);
  ctx.font = `normal 26px ${FUENTE}`;
  ctx.fillStyle = GRIS;
  ctx.fillText('sets', 240, y + 285);
  ctx.fillText('sets', 840, y + 285);

  // Resultado
  const textoResultado = datos.gano ? '¡Victoria!' : 'Este partido no se dio';
  ctx.font = `bold 32px ${FUENTE}`;
  const anchoBadge = ctx.measureText(textoResultado).width + 70;
  ctx.fillStyle = datos.gano ? VERDE_FONDO : ROJO_FONDO;
  rectRedondeado(ctx, mitad - anchoBadge / 2, y + 320, anchoBadge, 64, 32);
  ctx.fill();
  ctx.fillStyle = datos.gano ? VERDE : ROJO;
  ctx.textAlign = 'center';
  ctx.fillText(textoResultado, mitad, y + 363);
  y += altoMarcador + 30;

  // Sets uno a uno
  if (datos.sets.length > 0) {
    const n = datos.sets.length;
    const gap = 16;
    const ancho = (ANCHO - 2 * MARGEN - gap * (n - 1)) / n;
    datos.sets.forEach((s, i) => {
      const x = MARGEN + i * (ancho + gap);
      const ganado = s.roots > s.rival;
      ctx.fillStyle = ganado ? VERDE_FONDO : '#ffffff';
      rectRedondeado(ctx, x, y, ancho, 120, 22);
      ctx.fill();
      ctx.strokeStyle = ganado ? '#6ee7b7' : GRIS_CLARO;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = GRIS;
      ctx.font = `bold 22px ${FUENTE}`;
      ctx.fillText(`SET ${i + 1}`, x + ancho / 2, y + 38);
      ctx.fillStyle = ganado ? VERDE : NAVY;
      ctx.font = `bold ${n > 4 ? 36 : 44}px ${FUENTE}`;
      ctx.fillText(`${s.roots} - ${s.rival}`, x + ancho / 2, y + 90);
    });
    y += 120 + 40;
  }

  // Mejores jugadoras
  if (datos.destacadas.length > 0) {
    const alto = 110 + datos.destacadas.length * 100 + 10;
    tarjeta(ctx, MARGEN, y, ANCHO - 2 * MARGEN, alto);
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `bold 38px ${FUENTE}`;
    ctx.fillText(datos.tituloDestacadas, MARGEN + 40, y + 68);
    const colores = ['#f59e0b', '#9ca3af', '#d97706'];
    datos.destacadas.forEach((d, i) => {
      const cy = y + 110 + i * 100 + 40;
      ctx.fillStyle = colores[i];
      ctx.beginPath();
      ctx.arc(MARGEN + 40 + 30, cy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 32px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), MARGEN + 70, cy + 11);
      textoAjustado(ctx, `${d.nombre}${d.numero != null ? `  #${d.numero}` : ''}`, MARGEN + 130, cy - 4, 560, { tam: 34, color: NAVY });
      if (d.detalle) textoAjustado(ctx, d.detalle, MARGEN + 130, cy + 32, 560, { tam: 24, peso: 'normal', color: GRIS });
      ctx.fillStyle = VERDE_FONDO;
      rectRedondeado(ctx, ANCHO - MARGEN - 40 - 150, cy - 30, 150, 60, 30);
      ctx.fill();
      ctx.fillStyle = VERDE;
      ctx.font = `bold 28px ${FUENTE}`;
      ctx.textAlign = 'center';
      ctx.fillText(`+${d.positivas}`, ANCHO - MARGEN - 40 - 75, cy + 10);
    });
    y += alto + 30;
  }

  // Puntos clave
  if (datos.claves.length > 0) {
    const anchoTexto = ANCHO - 2 * MARGEN - 80 - 40;
    ctx.font = `normal 30px ${FUENTE}`;
    const alturas = datos.claves.map((c) => alturaParrafo(ctx, c, anchoTexto, 42));
    const alto = 110 + alturas.reduce((a, b) => a + b + 22, 0) + 10;
    tarjeta(ctx, MARGEN, y, ANCHO - 2 * MARGEN, alto);
    ctx.textAlign = 'left';
    ctx.fillStyle = NAVY;
    ctx.font = `bold 38px ${FUENTE}`;
    ctx.fillText('Puntos clave', MARGEN + 40, y + 68);
    let cy = y + 118;
    datos.claves.forEach((c, i) => {
      ctx.fillStyle = CANCHA;
      ctx.beginPath();
      ctx.arc(MARGEN + 52, cy + 14, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f2937';
      ctx.font = `normal 30px ${FUENTE}`;
      ctx.textAlign = 'left';
      parrafo(ctx, c, MARGEN + 80, cy + 24, anchoTexto, 42);
      cy += alturas[i] + 22;
    });
    y += alto + 30;
  }

  // Pie
  ctx.textAlign = 'center';
  ctx.fillStyle = GRIS;
  ctx.font = `normal 24px ${FUENTE}`;
  ctx.fillText('Gracias por acompañarnos y apoyar al equipo', mitad, y + 30);
  ctx.fillStyle = NAVY;
  ctx.font = `bold 24px ${FUENTE}`;
  ctx.fillText('Roots · Club de Voleibol', mitad, y + 66);
  const alturaFinal = Math.ceil(y + 100);

  const salida = crearCanvas(ANCHO, alturaFinal);
  salida.getContext('2d').drawImage(lienzo, 0, 0);
  return salida;
}


// ───────────── Del partido de la tablet a lo que dibuja el resumen ─────────────

// Roots arma el resumen con los sets y jugadas ya guardados; la tablet hace lo mismo: solo cuentan los sets cerrados.
export function datosDeRegistro({ registro, torneo, jugadores }) {
  const est = registro.est;
  return datosResumenPartido({
    partido: {
      equipoLocal: registro.equipoLocal,
      equipoVisitante: registro.equipoVisitante,
      ladoPropio: est.ladoPropio,
      fecha: registro.fecha,
      sets: est.sets.map((s) => ({ local: s.puntosLocal, visitante: s.puntosVisitante })),
    },
    torneo,
    jugadores,
    eventos: est.sets.flatMap((s) => s.eventos),
  });
}

// ───────────── Salidas: imagen, PDF, compartir ─────────────

const dos = (n) => String(n).padStart(2, '0');

function sanear(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
}

export function nombreBaseResumen(registro, datos) {
  return `resumen-${sanear(datos.equipo)}-vs-${sanear(datos.rival)}-${String(registro.fecha || `${new Date().getFullYear()}-${dos(new Date().getMonth() + 1)}-${dos(new Date().getDate())}`).slice(0, 10)}`;
}

// PDF de una sola página con la imagen del resumen (JPEG), de 150 mm de ancho como el de Roots.
// Se arma a mano para no depender de ninguna librería (la app tiene que abrir sin internet).
export function construirPdfDeJpeg(jpeg, anchoPx, altoPx, anchoMm = 150) {
  const puntos = (mm) => (mm / 25.4) * 72;
  const ancho = Number(puntos(anchoMm).toFixed(2));
  const alto = Number(puntos((altoPx / anchoPx) * anchoMm).toFixed(2));
  const enc = new TextEncoder();
  const trozos = [];
  const posiciones = [];
  let largo = 0;
  const poner = (dato) => {
    const bytes = typeof dato === 'string' ? enc.encode(dato) : dato;
    trozos.push(bytes);
    largo += bytes.length;
  };
  const objeto = (n, cuerpo) => {
    posiciones[n] = largo;
    poner(`${n} 0 obj\n`);
    cuerpo();
    poner('\nendobj\n');
  };
  const contenido = `q ${ancho} 0 0 ${alto} 0 0 cm /Im0 Do Q`;
  poner('%PDF-1.4\n');
  objeto(1, () => poner('<< /Type /Catalog /Pages 2 0 R >>'));
  objeto(2, () => poner('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'));
  objeto(3, () => poner(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ancho} ${alto}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`));
  objeto(4, () => {
    poner(`<< /Type /XObject /Subtype /Image /Width ${anchoPx} /Height ${altoPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    poner(jpeg);
    poner('\nendstream');
  });
  objeto(5, () => poner(`<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`));
  const inicioXref = largo;
  poner(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map((n) => `${String(posiciones[n]).padStart(10, '0')} 00000 n \n`).join('')}`);
  poner(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`);
  const salida = new Uint8Array(largo);
  let pos = 0;
  trozos.forEach((t) => { salida.set(t, pos); pos += t.length; });
  return salida;
}

function cargarLogo() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // sin logo el resumen sale igual
    img.src = 'img/roots-logo.png';
  });
}

function aBlob(canvas, tipo = 'image/png', calidad) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo crear la imagen.'))), tipo, calidad));
}

export async function prepararResumen({ registro, torneo, jugadores }) {
  const datos = datosDeRegistro({ registro, torneo, jugadores });
  const logo = await cargarLogo();
  const canvas = dibujarResumen(datos, logo);
  return { datos, canvas, nombre: nombreBaseResumen(registro, datos) };
}

export async function blobPng(resumen) {
  return aBlob(resumen.canvas);
}

export async function blobPdf(resumen) {
  const jpeg = new Uint8Array(await (await aBlob(resumen.canvas, 'image/jpeg', 0.93)).arrayBuffer());
  return new Blob([construirPdfDeJpeg(jpeg, resumen.canvas.width, resumen.canvas.height)], { type: 'application/pdf' });
}

export function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  document.body.removeChild(enlace);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export async function descargarResumenPng(resumen) {
  descargarBlob(await blobPng(resumen), `${resumen.nombre}.png`);
}

export async function descargarResumenPdf(resumen) {
  descargarBlob(await blobPdf(resumen), `${resumen.nombre}.pdf`);
}

export function puedeCompartirArchivos() {
  try {
    return typeof navigator !== 'undefined' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [new File([''], 'prueba.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
}

// Abre el menú de compartir del sistema (WhatsApp, correo…) con la imagen del resumen.
export async function compartirResumen(resumen) {
  const archivo = new File([await blobPng(resumen)], `${resumen.nombre}.png`, { type: 'image/png' });
  await navigator.share({ files: [archivo], title: `${resumen.datos.equipo} vs ${resumen.datos.rival}` });
}
