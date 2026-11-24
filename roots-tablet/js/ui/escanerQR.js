// Escanear con la cámara los códigos QR de un archivo (el formato está en qr/marcos.js).
import { ErrorMarcos, ReceptorMarcos } from '../qr/marcos.js';
import { abrirVentana, informar } from './aviso.js';
import { h } from './dom.js';

async function lectorDisponible() {
  try {
    if (!('BarcodeDetector' in globalThis)) return false;
    const formatos = await globalThis.BarcodeDetector.getSupportedFormats();
    return formatos.includes('qr_code');
  } catch {
    return false;
  }
}

// Abre la cámara y, cuando están todos los códigos, llama a alTexto(texto). Devuelve true si recibió el archivo.
export async function escanearArchivo({ alTexto }) {
  if (!(await lectorDisponible()) || !navigator.mediaDevices?.getUserMedia) {
    await informar({ titulo: 'Esta tablet no puede leer códigos QR', texto: 'El lector de QR viene en Chrome para Android (actualizado). Usa Google Drive o elige el archivo.' });
    return false;
  }
  let flujo;
  try {
    flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch (err) {
    const denegado = err?.name === 'NotAllowedError';
    await informar({ titulo: 'No pude abrir la cámara', texto: denegado ? 'Falta el permiso de la cámara. Actívalo para Roots en los ajustes de la tablet y vuelve a intentarlo.' : 'La cámara no está disponible ahora.' });
    return false;
  }

  return new Promise((resolver) => {
    const detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] });
    const receptor = new ReceptorMarcos();
    let activo = true;
    let leyendo = false;

    const video = h('video', { class: 'escaner-video', autoplay: true, muted: true, playsinline: true });
    video.srcObject = flujo;
    const estado = h('p', { class: 'qr-contador' }, 'Apunta la cámara al código QR');
    const barra = h('div', { class: 'barra-progreso' }, h('div', { class: 'barra-progreso-relleno', style: { width: '0%' } }));
    const detalle = h('p', { class: 'nota' }, 'Puede empezar en cualquier código: se juntan solos.');

    const parar = () => {
      activo = false;
      flujo.getTracks().forEach((t) => t.stop());
    };

    const ventana = abrirVentana({
      titulo: 'Escanear código QR',
      ancho: 'grande',
      sinCerrarFuera: true,
      contenido: h('div', { class: 'qr-vista' }, video, estado, barra, detalle),
      acciones: [{ texto: 'Cancelar', onclick: () => { parar(); resolver(false); } }],
      alCerrar: () => { parar(); resolver(false); },
    });

    const mostrarProgreso = ({ recibidos, total }) => {
      estado.textContent = `Van ${recibidos} de ${total}`;
      barra.firstChild.style.width = `${Math.round((recibidos / total) * 100)}%`;
      const faltan = receptor.faltan;
      detalle.textContent = faltan.length && faltan.length <= 8 ? `Faltan los códigos: ${faltan.join(', ')}` : 'Sigue apuntando; los códigos se repiten en bucle.';
    };

    const terminar = async () => {
      parar();
      try {
        const texto = await receptor.texto();
        ventana.cerrar();
        await alTexto(texto);
        resolver(true);
      } catch (err) {
        ventana.cerrar();
        await informar({ titulo: 'No se pudo recibir', texto: err instanceof ErrorMarcos ? err.message : 'Algo falló al armar el archivo. Vuelve a intentarlo.' });
        resolver(false);
      }
    };

    const leer = async () => {
      if (!activo) return;
      if (!leyendo && video.readyState >= 2) {
        leyendo = true;
        try {
          for (const codigo of await detector.detect(video)) {
            const r = receptor.aceptar(codigo.rawValue);
            if (r.tipo === 'nuevo' || r.tipo === 'completo') {
              navigator.vibrate?.(20);
              mostrarProgreso(r);
            }
            if (r.tipo === 'completo') {
              terminar();
              return;
            }
          }
        } catch {
          /* un fotograma que no se pudo leer: se sigue con el siguiente */
        }
        leyendo = false;
      }
      setTimeout(leer, 100);
    };
    leer();
  });
}
