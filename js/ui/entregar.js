// Entregar un archivo JSON: subirlo a Google Drive, mostrarlo como códigos QR, compartirlo (WhatsApp, correo...) o
// descargarlo. Devuelve true si el archivo salió, false si la persona canceló o no lo logró.
import { CONFIG } from '../config.js';
import { abrirVentana } from './aviso.js';
import { h, icono } from './dom.js';
import { driveConfigurado, precargarGoogle } from './driveSesion.js';
import { mostrarQR } from './mostrarQR.js';
import { enviarADrive } from './transferir.js';

function descargar(archivo) {
  const url = URL.createObjectURL(archivo);
  const a = h('a', { href: url, download: archivo.name, class: 'solo-lector' });
  document.body.append(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 4000);
}

export function entregarArchivo(texto, nombre, { titulo = 'Enviar el archivo', textoCompartir = 'Elige cómo sacarlo de la tablet.' } = {}) {
  const archivo = new File([texto], nombre, { type: 'application/json' });
  const puedeCompartir = Boolean(navigator.canShare?.({ files: [archivo] }) && navigator.share);
  precargarGoogle().catch(() => {});
  return new Promise((resolver) => {
    let hecho = false;
    const terminar = (valor) => {
      if (!hecho) {
        hecho = true;
        resolver(valor);
      }
    };
    const opcion = (icon, t, sub, accion) =>
      h(
        'button',
        {
          class: 'opcion',
          onclick: async () => {
            let ok = false;
            try {
              ok = await accion();
            } catch (err) {
              console.error(err);
            }
            if (ok) {
              terminar(true);
              ventana.cerrar();
            }
          },
        },
        icono(icon),
        h('span', { class: 'datos' }, h('strong', {}, t), sub ? h('small', {}, sub) : null)
      );
    const filas = [
      opcion('subir', 'Subir a Google Drive', driveConfigurado() ? `Carpeta "${CONFIG.carpetaDeEnvios}" · necesita internet` : 'Falta configurarlo', () => enviarADrive(texto, nombre)),
      opcion('documento', 'Mostrar código QR', 'Sin internet: otra tablet lo escanea con la cámara', () => mostrarQR(texto, nombre)),
    ];
    if (puedeCompartir) {
      filas.push(
        opcion('compartir', 'Compartir…', 'WhatsApp, correo u otra app', async () => {
          try {
            await navigator.share({ files: [archivo], title: nombre });
            return true;
          } catch (err) {
            if (err?.name === 'AbortError') return false;
            throw err;
          }
        })
      );
    }
    filas.push(
      opcion('bajar', 'Guardar en la tablet', 'Queda en la carpeta Descargas', async () => {
        descargar(archivo);
        return true;
      })
    );
    const ventana = abrirVentana({ titulo, subtitulo: textoCompartir, ancho: 'media', contenido: h('div', { class: 'lista-opciones' }, filas), alCerrar: () => terminar(false) });
  });
}
