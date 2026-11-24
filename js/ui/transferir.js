// Pasar archivos sin cables ni correo: recibir (Google Drive, código QR o archivo) y enviar (Drive o QR).
import { CONFIG } from '../config.js';
import { ErrorDrive } from '../drive.js';
import { abrirVentana, informar, toast } from './aviso.js';
import { h, icono } from './dom.js';
import { drive, driveConfigurado, olvidarSesion, precargarGoogle } from './driveSesion.js';
import { escanearArchivo } from './escanerQR.js';

const fechaHora = (iso) => new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

export function explicarConfiguracion() {
  return informar({
    titulo: 'Google Drive sin configurar',
    texto: 'Para usar Drive, quien publica la app debe pegar el ID de cliente de Google en js/config.js (los pasos están en el README, sección "Google Drive"). Mientras tanto puedes usar los códigos QR o compartir el archivo.',
  });
}

async function avisarErrorDrive(err) {
  if (err instanceof ErrorDrive) {
    if (err.codigo === 'sesion') olvidarSesion();
    await informar({ titulo: 'Google Drive', texto: err.message });
  } else {
    console.error(err);
    await informar({ titulo: 'Google Drive', texto: 'Algo falló con Google Drive. Inténtalo de nuevo.' });
  }
}

const opcion = (icon, titulo, sub, onclick, extra = '') =>
  h('button', { class: `opcion ${extra}`, onclick }, icono(icon), h('span', { class: 'datos' }, h('strong', {}, titulo), sub ? h('small', {}, sub) : null));

// ─────────────── Recibir ───────────────
// alRecibirTexto(texto, nombre): lo que se hace con el archivo recibido (importarlo). alElegirArchivo: el selector de siempre.
export function abrirRecibir({ alRecibirTexto, alElegirArchivo }) {
  precargarGoogle().catch(() => {});
  const v = abrirVentana({
    titulo: 'Recibir de Roots',
    subtitulo: 'Elige cómo te llega el archivo "Exportar para tablet"',
    ancho: 'media',
    contenido: h(
      'div',
      { class: 'lista-opciones' },
      opcion('subir', 'Desde Google Drive', driveConfigurado() ? `Carpeta "${CONFIG.carpetaDeRoots}" · necesita internet` : 'Falta configurarlo', () => { v.cerrar(); recibirDeDrive(alRecibirTexto); }),
      opcion('documento', 'Escanear código QR', 'Sin internet: Roots muestra los códigos y la tablet los lee', () => { v.cerrar(); escanearArchivo({ alTexto: (t) => alRecibirTexto(t, 'código QR') }); }),
      opcion('lista', 'Elegir un archivo', 'Del almacenamiento de la tablet o de Drive con el selector', () => { v.cerrar(); alElegirArchivo(); })
    ),
  });
}

async function recibirDeDrive(alRecibirTexto) {
  if (!driveConfigurado()) return explicarConfiguracion();
  const quitarAviso = toast('Conectando con Google Drive…', 'info', 60000);
  try {
    const carpeta = await drive.buscarCarpeta(CONFIG.carpetaDeRoots);
    if (!carpeta) {
      quitarAviso();
      return informar({ titulo: 'No encuentro la carpeta', texto: `En tu Google Drive no hay una carpeta llamada "${CONFIG.carpetaDeRoots}". Sube ahí el archivo que baja Roots con "Exportar para tablet".` });
    }
    const archivos = await drive.listarJson(carpeta.id);
    quitarAviso();
    if (!archivos.length) return informar({ titulo: 'La carpeta está vacía', texto: `En "${CONFIG.carpetaDeRoots}" no hay archivos .json todavía.` });
    const v = abrirVentana({
      titulo: 'Archivos en Drive',
      subtitulo: `Carpeta "${CONFIG.carpetaDeRoots}" · el más nuevo primero`,
      ancho: 'media',
      contenido: h(
        'div',
        { class: 'lista-opciones' },
        archivos.map((a) =>
          opcion('documento', a.name, `${fechaHora(a.modifiedTime)}${a.size ? ` · ${Math.max(1, Math.round(Number(a.size) / 1024))} KB` : ''}`, async () => {
            v.cerrar();
            const quitar = toast('Bajando el archivo…', 'info', 60000);
            try {
              const texto = await drive.descargarTexto(a.id);
              quitar();
              await alRecibirTexto(texto, a.name);
            } catch (err) {
              quitar();
              await avisarErrorDrive(err);
            }
          })
        )
      ),
    });
  } catch (err) {
    quitarAviso();
    await avisarErrorDrive(err);
  }
}

// ─────────────── Enviar ───────────────
// Devuelve true si el archivo quedó en Drive.
export async function enviarADrive(texto, nombre) {
  if (!driveConfigurado()) {
    await explicarConfiguracion();
    return false;
  }
  const quitar = toast('Subiendo a Google Drive…', 'info', 60000);
  try {
    const carpeta = await drive.asegurarCarpeta(CONFIG.carpetaDeEnvios);
    await drive.subirTexto({ nombre, texto, carpetaId: carpeta.id });
    quitar();
    toast(`Subido a Drive › ${CONFIG.carpetaDeEnvios}`, 'ok', 4000);
    return true;
  } catch (err) {
    quitar();
    await avisarErrorDrive(err);
    return false;
  }
}
