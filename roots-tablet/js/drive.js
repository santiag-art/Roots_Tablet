// Google Drive: buscar la carpeta de Roots, bajar el archivo que dejó Roots y subir lo que la tablet envía.
//
// No sabe nada de pantallas ni de cómo se inicia sesión: recibe `fetch` y una función que da el token de acceso,
// para poder probarlo sin internet. Todos los errores salen como ErrorDrive con un mensaje para la persona.
const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';
const CARPETA = 'application/vnd.google-apps.folder';

export class ErrorDrive extends Error {
  constructor(mensaje, { codigo = 'otro' } = {}) {
    super(mensaje);
    this.name = 'ErrorDrive';
    this.codigo = codigo; // 'sin-internet' | 'sesion' | 'permiso' | 'no-existe' | 'otro'
  }
}

// En las búsquedas de Drive, comillas simples y barras se escapan con barra.
const escapar = (t) => String(t).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export function crearDrive({ fetch: pedir = globalThis.fetch?.bind(globalThis), obtenerToken }) {
  async function llamar(url, opciones = {}) {
    const token = await obtenerToken();
    let r;
    try {
      r = await pedir(url, { ...opciones, headers: { ...(opciones.headers ?? {}), Authorization: `Bearer ${token}` } });
    } catch {
      throw new ErrorDrive('No hay conexión con Google Drive. Revisa el internet de la tablet.', { codigo: 'sin-internet' });
    }
    if (r.ok) return r;
    if (r.status === 401) throw new ErrorDrive('Se cerró la sesión de Google. Vuelve a intentarlo.', { codigo: 'sesion' });
    if (r.status === 403) throw new ErrorDrive('Google no dejó hacer esto. Revisa que aceptaste los permisos y que tu cuenta puede usar la app.', { codigo: 'permiso' });
    if (r.status === 404) throw new ErrorDrive('Ese archivo ya no está en Drive.', { codigo: 'no-existe' });
    throw new ErrorDrive(`Google Drive respondió con un error (${r.status}). Inténtalo de nuevo en un momento.`);
  }

  async function buscar(q, extra = {}) {
    const params = new URLSearchParams({ q, fields: 'files(id,name,modifiedTime,size)', orderBy: 'modifiedTime desc', pageSize: '20', spaces: 'drive', ...extra });
    const r = await llamar(`${API}/files?${params}`);
    return (await r.json()).files ?? [];
  }

  const api = {
    // La carpeta más reciente con ese nombre, o null.
    async buscarCarpeta(nombre) {
      const [primera] = await buscar(`name = '${escapar(nombre)}' and mimeType = '${CARPETA}' and trashed = false`);
      return primera ?? null;
    },

    async crearCarpeta(nombre) {
      const r = await llamar(`${API}/files?fields=id,name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: nombre, mimeType: CARPETA }) });
      return r.json();
    },

    async asegurarCarpeta(nombre) {
      return (await api.buscarCarpeta(nombre)) ?? api.crearCarpeta(nombre);
    },

    // Archivos .json de una carpeta, el más nuevo primero.
    async listarJson(carpetaId) {
      const archivos = await buscar(`'${escapar(carpetaId)}' in parents and trashed = false and mimeType != '${CARPETA}'`);
      return archivos.filter((a) => /\.json$/i.test(a.name));
    },

    async descargarTexto(archivoId) {
      const r = await llamar(`${API}/files/${encodeURIComponent(archivoId)}?alt=media`);
      return r.text();
    },

    async subirTexto({ nombre, texto, carpetaId }) {
      const limite = `roots${Math.random().toString(36).slice(2)}`;
      const cuerpo =
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: nombre, parents: [carpetaId], mimeType: 'application/json' })}\r\n` +
        `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${texto}\r\n--${limite}--`;
      const r = await llamar(`${SUBIDA}?uploadType=multipart&fields=id,name`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${limite}` }, body: cuerpo });
      return r.json();
    },
  };
  return api;
}
