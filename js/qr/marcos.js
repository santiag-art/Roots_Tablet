// Pasar un archivo por códigos QR: se comprime, se corta en "marcos" cortos y cada marco va en un QR.
// Quien envía muestra los marcos en bucle; quien recibe los va escaneando en cualquier orden (los repetidos se
// ignoran) hasta tener todos. Al final se comprueba que el archivo llegó completo y sin errores.
//
// Formato de cada marco (texto):   RT1.<id>.<i>.<n>.<c>.<crc>.<datos>
//   RT1   versión del formato           id    4 letras, distinto en cada envío
//   i, n  número de marco (desde 0) y total
//   c     1 = comprimido con gzip, 0 = texto tal cual
//   crc   CRC-32 (8 hex) de TODOS los bytes ya unidos      datos  trozo en base64 seguro para URL
// Roots puede leer y escribir este mismo formato: el módulo no depende de la pantalla.

export const PREFIJO = 'RT1';
export const CARACTERES_POR_MARCO = 480;
export const MAX_MARCOS = 600;

export class ErrorMarcos extends Error {}

// ─────────────── Utilidades ───────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function aBase64Url(bytes) {
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(binario, (c) => c.charCodeAt(0));
}

async function pasarPorFlujo(bytes, flujo) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(flujo)).arrayBuffer());
}

const nuevoId = () => Array.from({ length: 4 }, () => 'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 31)]).join('');

// ─────────────── Emisor ───────────────
// Devuelve la lista de marcos (textos) para un archivo de texto.
export async function crearMarcos(texto, { caracteres = CARACTERES_POR_MARCO, id = nuevoId() } = {}) {
  let bytes = new TextEncoder().encode(texto);
  let comprimido = 0;
  if (typeof CompressionStream !== 'undefined') {
    bytes = await pasarPorFlujo(bytes, new CompressionStream('gzip'));
    comprimido = 1;
  }
  const todo = aBase64Url(bytes);
  const total = Math.max(1, Math.ceil(todo.length / caracteres));
  if (total > MAX_MARCOS) throw new ErrorMarcos(`El archivo es demasiado grande para códigos QR (${total} marcos). Usa Google Drive o compártelo.`);
  const crc = crc32(bytes);
  return Array.from({ length: total }, (_, i) => `${PREFIJO}.${id}.${i}.${total}.${comprimido}.${crc}.${todo.slice(i * caracteres, (i + 1) * caracteres)}`);
}

// ─────────────── Receptor ───────────────
function leerMarco(texto) {
  const m = /^RT1\.([a-z0-9]{4})\.(\d{1,4})\.(\d{1,4})\.([01])\.([0-9a-f]{8})\.([A-Za-z0-9_-]*)$/.exec(texto);
  if (!m) return null;
  const [, id, i, n, c, crc, datos] = m;
  if (Number(n) < 1 || Number(n) > MAX_MARCOS || Number(i) >= Number(n)) return null;
  return { id, i: Number(i), n: Number(n), comprimido: c === '1', crc, datos };
}

export class ReceptorMarcos {
  constructor() {
    this.reiniciar();
  }

  reiniciar() {
    this.id = null;
    this.total = 0;
    this.meta = null;
    this.partes = new Map();
  }

  // Devuelve { tipo: 'ignorado' | 'repetido' | 'nuevo' | 'completo', recibidos, total }.
  // 'ignorado' = el QR no es de esta transferencia (otro texto cualquiera): no cambia nada.
  aceptar(texto) {
    const marco = leerMarco(String(texto).trim());
    if (!marco) return { tipo: 'ignorado', recibidos: this.partes.size, total: this.total };
    if (marco.id !== this.id) {
      this.reiniciar(); // empezó otro envío: se descarta lo anterior
      this.id = marco.id;
      this.total = marco.n;
      this.meta = { comprimido: marco.comprimido, crc: marco.crc };
    } else if (marco.n !== this.total || marco.crc !== this.meta.crc || marco.comprimido !== this.meta.comprimido) {
      return { tipo: 'ignorado', recibidos: this.partes.size, total: this.total };
    }
    if (this.partes.has(marco.i)) return { tipo: 'repetido', recibidos: this.partes.size, total: this.total };
    this.partes.set(marco.i, marco.datos);
    return { tipo: this.partes.size === this.total ? 'completo' : 'nuevo', recibidos: this.partes.size, total: this.total };
  }

  get completo() {
    return this.total > 0 && this.partes.size === this.total;
  }

  // Números de marco (desde 1) que todavía faltan.
  get faltan() {
    return Array.from({ length: this.total }, (_, i) => i).filter((i) => !this.partes.has(i)).map((i) => i + 1);
  }

  // Une los marcos y devuelve el texto del archivo. Lanza ErrorMarcos si algo no cuadra.
  async texto() {
    if (!this.completo) throw new ErrorMarcos('Todavía faltan marcos.');
    const unido = Array.from({ length: this.total }, (_, i) => this.partes.get(i)).join('');
    let bytes;
    try {
      bytes = deBase64Url(unido);
    } catch {
      throw new ErrorMarcos('Los códigos llegaron dañados. Vuelve a escanear.');
    }
    if (crc32(bytes) !== this.meta.crc) throw new ErrorMarcos('El archivo llegó con errores (alguna lectura salió mal). Vuelve a escanear.');
    if (this.meta.comprimido) {
      if (typeof DecompressionStream === 'undefined') throw new ErrorMarcos('Este navegador no puede abrir el archivo comprimido. Actualiza Chrome.');
      try {
        bytes = await pasarPorFlujo(bytes, new DecompressionStream('gzip'));
      } catch {
        throw new ErrorMarcos('No se pudo descomprimir el archivo. Vuelve a escanear.');
      }
    }
    return new TextDecoder().decode(bytes);
  }
}
