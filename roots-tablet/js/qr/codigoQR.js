// Generador de códigos QR (modo bytes, niveles de corrección L y M, versiones 1 a 40).
//
// Escrito aquí para que la app no dependa de ninguna librería ni de internet. Solo ESCRIBE códigos; para leerlos
// se usa la cámara de la tablet (ver ui/escanerQR.js). Es una función pura: devuelve una matriz de módulos
// (true = oscuro) y no toca la pantalla.

// Para cada versión (1 a 40): grupos de bloques [cantidad, palabras totales por bloque, palabras de datos por bloque].
const BLOQUES = {
  L: [
    [[1,26,19]],
    [[1,44,34]],
    [[1,70,55]],
    [[1,100,80]],
    [[1,134,108]],
    [[2,86,68]],
    [[2,98,78]],
    [[2,121,97]],
    [[2,146,116]],
    [[2,86,68],[2,87,69]],
    [[4,101,81]],
    [[2,116,92],[2,117,93]],
    [[4,133,107]],
    [[3,145,115],[1,146,116]],
    [[5,109,87],[1,110,88]],
    [[5,122,98],[1,123,99]],
    [[1,135,107],[5,136,108]],
    [[5,150,120],[1,151,121]],
    [[3,141,113],[4,142,114]],
    [[3,135,107],[5,136,108]],
    [[4,144,116],[4,145,117]],
    [[2,139,111],[7,140,112]],
    [[4,151,121],[5,152,122]],
    [[6,147,117],[4,148,118]],
    [[8,132,106],[4,133,107]],
    [[10,142,114],[2,143,115]],
    [[8,152,122],[4,153,123]],
    [[3,147,117],[10,148,118]],
    [[7,146,116],[7,147,117]],
    [[5,145,115],[10,146,116]],
    [[13,145,115],[3,146,116]],
    [[17,145,115]],
    [[17,145,115],[1,146,116]],
    [[13,145,115],[6,146,116]],
    [[12,151,121],[7,152,122]],
    [[6,151,121],[14,152,122]],
    [[17,152,122],[4,153,123]],
    [[4,152,122],[18,153,123]],
    [[20,147,117],[4,148,118]],
    [[19,148,118],[6,149,119]],
  ],
  M: [
    [[1,26,16]],
    [[1,44,28]],
    [[1,70,44]],
    [[2,50,32]],
    [[2,67,43]],
    [[4,43,27]],
    [[4,49,31]],
    [[2,60,38],[2,61,39]],
    [[3,58,36],[2,59,37]],
    [[4,69,43],[1,70,44]],
    [[1,80,50],[4,81,51]],
    [[6,58,36],[2,59,37]],
    [[8,59,37],[1,60,38]],
    [[4,64,40],[5,65,41]],
    [[5,65,41],[5,66,42]],
    [[7,73,45],[3,74,46]],
    [[10,74,46],[1,75,47]],
    [[9,69,43],[4,70,44]],
    [[3,70,44],[11,71,45]],
    [[3,67,41],[13,68,42]],
    [[17,68,42]],
    [[17,74,46]],
    [[4,75,47],[14,76,48]],
    [[6,73,45],[14,74,46]],
    [[8,75,47],[13,76,48]],
    [[19,74,46],[4,75,47]],
    [[22,73,45],[3,74,46]],
    [[3,73,45],[23,74,46]],
    [[21,73,45],[7,74,46]],
    [[19,75,47],[10,76,48]],
    [[2,74,46],[29,75,47]],
    [[10,74,46],[23,75,47]],
    [[14,74,46],[21,75,47]],
    [[14,74,46],[23,75,47]],
    [[12,75,47],[26,76,48]],
    [[6,75,47],[34,76,48]],
    [[29,74,46],[14,75,47]],
    [[13,74,46],[32,75,47]],
    [[40,75,47],[7,76,48]],
    [[18,75,47],[31,76,48]],
  ],
};
const BITS_NIVEL = { L: 1, M: 0 }; // los 2 bits del nivel en la información de formato

export class ErrorQR extends Error {}

const grupos = (version, nivel) => BLOQUES[nivel][version - 1];
const palabrasDeDatos = (version, nivel) => grupos(version, nivel).reduce((s, [n, , d]) => s + n * d, 0);

// Cuántos bytes de texto caben en esa versión.
export function capacidadBytes(version, nivel = 'L') {
  const bitsEncabezado = 4 + (version < 10 ? 8 : 16);
  return Math.floor((palabrasDeDatos(version, nivel) * 8 - bitsEncabezado) / 8);
}

// ─────────────── Aritmética de Reed-Solomon (GF(256), polinomio 0x11D) ───────────────
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const multiplicar = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function generador(grado) {
  let poli = [1];
  for (let i = 0; i < grado; i++) {
    const sig = new Array(poli.length + 1).fill(0);
    poli.forEach((c, j) => {
      sig[j] ^= c;
      sig[j + 1] ^= multiplicar(c, EXP[i]);
    });
    poli = sig;
  }
  return poli.slice(1); // sin el coeficiente principal (siempre 1)
}

function correccion(datos, grado) {
  const gen = generador(grado);
  const resto = new Array(grado).fill(0);
  for (const b of datos) {
    const factor = b ^ resto.shift();
    resto.push(0);
    gen.forEach((g, i) => {
      resto[i] ^= multiplicar(g, factor);
    });
  }
  return resto;
}

// ─────────────── Datos → palabras de código (con bloques entrelazados) ───────────────
function palabrasDeCodigo(bytes, version, nivel) {
  const bits = [];
  const poner = (valor, cuantos) => {
    for (let i = cuantos - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  poner(0b0100, 4); // modo bytes
  poner(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((b) => poner(b, 8));
  const capacidadBits = palabrasDeDatos(version, nivel) * 8;
  poner(0, Math.min(4, capacidadBits - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let relleno = 0xec; bits.length < capacidadBits; relleno ^= 0xec ^ 0x11) poner(relleno, 8);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(''), 2));

  const bloques = [];
  let pos = 0;
  for (const [cantidad, total, deDatos] of grupos(version, nivel)) {
    for (let i = 0; i < cantidad; i++) {
      const d = datos.slice(pos, pos + deDatos);
      pos += deDatos;
      bloques.push({ datos: d, ecc: correccion(d, total - deDatos) });
    }
  }
  const salida = [];
  const maxDatos = Math.max(...bloques.map((b) => b.datos.length));
  for (let i = 0; i < maxDatos; i++) bloques.forEach((b) => i < b.datos.length && salida.push(b.datos[i]));
  for (let i = 0; i < bloques[0].ecc.length; i++) bloques.forEach((b) => salida.push(b.ecc[i]));
  return salida;
}

// ─────────────── Dibujo de la matriz ───────────────
function posicionesAlineacion(version) {
  if (version === 1) return [];
  const n = Math.floor(version / 7) + 2;
  const tam = version * 4 + 17;
  const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (n * 2 - 2)) * 2;
  const pos = [6];
  for (let p = tam - 7; pos.length < n; p -= paso) pos.splice(1, 0, p);
  return pos;
}

function penalizacion(m, tam) {
  let total = 0;
  // Regla 1: rachas de 5 o más del mismo color (filas y columnas)
  for (const porFila of [true, false]) {
    for (let a = 0; a < tam; a++) {
      let color = null;
      let racha = 0;
      for (let b = 0; b < tam; b++) {
        const v = porFila ? m[a][b] : m[b][a];
        if (v === color) {
          racha++;
          if (racha === 5) total += 3;
          else if (racha > 5) total += 1;
        } else {
          color = v;
          racha = 1;
        }
      }
    }
  }
  // Regla 2: bloques de 2x2 del mismo color
  for (let y = 0; y < tam - 1; y++)
    for (let x = 0; x < tam - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) total += 3;
  // Regla 3: patrón parecido al de las esquinas (1:1:3:1:1) con 4 claros a un lado
  const patA = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
  const patB = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
  for (const porFila of [true, false]) {
    for (let a = 0; a < tam; a++) {
      for (let b = 0; b <= tam - 11; b++) {
        let iguala = true;
        let igualb = true;
        for (let k = 0; k < 11 && (iguala || igualb); k++) {
          const v = (porFila ? m[a][b + k] : m[b + k][a]) ? 1 : 0;
          if (v !== patA[k]) iguala = false;
          if (v !== patB[k]) igualb = false;
        }
        if (iguala) total += 40;
        if (igualb) total += 40;
      }
    }
  }
  // Regla 4: proporción de módulos oscuros
  let oscuros = 0;
  m.forEach((fila) => fila.forEach((v) => v && oscuros++));
  const k = Math.ceil(Math.abs(oscuros * 20 - tam * tam * 10) / (tam * tam)) - 1;
  return total + Math.max(0, k) * 10;
}

const MASCARAS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0,
];

// Devuelve { version, tam, modulos } con modulos[y][x] = true si el módulo es oscuro.
export function crearQR(texto, { nivel = 'L', versionMinima = 1 } = {}) {
  if (!BLOQUES[nivel]) throw new ErrorQR(`Nivel desconocido: ${nivel}`);
  const bytes = [...new TextEncoder().encode(texto)];
  let version = Math.max(1, versionMinima);
  while (version <= 40 && capacidadBytes(version, nivel) < bytes.length) version++;
  if (version > 40) throw new ErrorQR('El texto no cabe en un código QR.');
  const tam = version * 4 + 17;
  const m = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const funcion = Array.from({ length: tam }, () => new Array(tam).fill(false));
  const poner = (x, y, oscuro, esFuncion = true) => {
    m[y][x] = oscuro;
    if (esFuncion) funcion[y][x] = true;
  };

  // Patrones fijos
  for (let i = 0; i < tam; i++) {
    poner(6, i, i % 2 === 0);
    poner(i, 6, i % 2 === 0);
  }
  const esquina = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && x < tam && y >= 0 && y < tam) poner(x, y, Math.max(Math.abs(dx), Math.abs(dy)) !== 2 && Math.max(Math.abs(dx), Math.abs(dy)) !== 4);
      }
  };
  esquina(3, 3);
  esquina(tam - 4, 3);
  esquina(3, tam - 4);
  const alin = posicionesAlineacion(version);
  alin.forEach((cy, i) =>
    alin.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === alin.length - 1) || (i === alin.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poner(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    })
  );
  const dibujarFormato = (mascara) => {
    const datos = (BITS_NIVEL[nivel] << 3) | mascara;
    let resto = datos;
    for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const bits = ((datos << 10) | resto) ^ 0x5412;
    const b = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) poner(8, i, b(i));
    poner(8, 7, b(6));
    poner(8, 8, b(7));
    poner(7, 8, b(8));
    for (let i = 9; i < 15; i++) poner(14 - i, 8, b(i));
    for (let i = 0; i < 8; i++) poner(tam - 1 - i, 8, b(i));
    for (let i = 8; i < 15; i++) poner(8, tam - 15 + i, b(i));
    poner(8, tam - 8, true); // módulo oscuro fijo
  };
  dibujarFormato(0);
  if (version >= 7) {
    let resto = version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const oscuro = ((bits >>> i) & 1) === 1;
      const a = tam - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poner(a, b, oscuro);
      poner(b, a, oscuro);
    }
  }

  // Datos en zigzag, de abajo a la derecha hacia arriba
  const palabras = palabrasDeCodigo(bytes, version, nivel);
  let bit = 0;
  for (let derecha = tam - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vert = 0; vert < tam; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = derecha - j;
        const sube = ((derecha + 1) & 2) === 0;
        const y = sube ? tam - 1 - vert : vert;
        if (!funcion[y][x] && bit < palabras.length * 8) {
          m[y][x] = ((palabras[bit >>> 3] >>> (7 - (bit & 7))) & 1) === 1;
          bit++;
        }
      }
    }
  }

  // Elegir la máscara con menos penalización
  const aplicar = (mascara) => {
    for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) if (!funcion[y][x] && MASCARAS[mascara](x, y)) m[y][x] = !m[y][x];
  };
  let mejor = 0;
  let mejorPuntos = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    aplicar(mascara);
    dibujarFormato(mascara);
    const puntos = penalizacion(m, tam);
    if (puntos < mejorPuntos) {
      mejor = mascara;
      mejorPuntos = puntos;
    }
    aplicar(mascara); // deshacer
  }
  aplicar(mejor);
  dibujarFormato(mejor);
  return { version, tam, modulos: m };
}

// Dibuja el código en un <canvas>: módulos negros sobre fondo blanco con margen (el lector lo necesita).
export function dibujarQR(canvas, qr, { ancho = 480, margen = 4 } = {}) {
  const celdas = qr.tam + margen * 2;
  const escala = Math.max(1, Math.floor(ancho / celdas));
  canvas.width = celdas * escala;
  canvas.height = celdas * escala;
  const c = canvas.getContext('2d');
  c.fillStyle = '#fff';
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = '#000';
  qr.modulos.forEach((fila, y) =>
    fila.forEach((oscuro, x) => {
      if (oscuro) c.fillRect((x + margen) * escala, (y + margen) * escala, escala, escala);
    })
  );
}
