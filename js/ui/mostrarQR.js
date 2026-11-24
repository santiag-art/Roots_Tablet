// Mostrar un archivo como códigos QR en bucle, para que otra tablet (o Roots) lo escanee.
import { dibujarQR, crearQR } from '../qr/codigoQR.js';
import { ErrorMarcos, crearMarcos } from '../qr/marcos.js';
import { abrirVentana, informar } from './aviso.js';
import { h } from './dom.js';

const VELOCIDADES = [
  { nombre: 'Lento', fps: 2 },
  { nombre: 'Normal', fps: 4 },
  { nombre: 'Rápido', fps: 7 },
];

// Devuelve true si la persona confirmó que ya lo recibieron.
export async function mostrarQR(texto, nombre) {
  let marcos;
  try {
    marcos = await crearMarcos(texto);
  } catch (err) {
    if (err instanceof ErrorMarcos) {
      await informar({ titulo: 'No cabe en códigos QR', texto: err.message });
      return false;
    }
    throw err;
  }
  // Todos los códigos del mismo tamaño: el lector se acomoda mejor si no cambia de una imagen a otra.
  const versionMinima = crearQR(marcos.reduce((a, b) => (b.length > a.length ? b : a)), { nivel: 'L' }).version;
  const dibujo = (i) => crearQR(marcos[i], { nivel: 'L', versionMinima });

  return new Promise((resolver) => {
    let indice = 0;
    let velocidad = 1;
    let pausado = false;
    let temporizador = null;
    let terminado = false;

    const lienzo = h('canvas', { class: 'qr-lienzo', 'aria-label': 'Código QR del archivo' });
    const contador = h('p', { class: 'qr-contador', 'aria-live': 'off' });
    const botonPausa = h('button', { class: 'btn', onclick: () => { pausado = !pausado; botonPausa.textContent = pausado ? 'Seguir' : 'Pausa'; } }, 'Pausa');
    const etiquetaVel = h('span', {}, VELOCIDADES[velocidad].nombre);

    const pintar = () => {
      const lado = Math.max(240, Math.min(560, Math.floor(Math.min(window.innerHeight * 0.6, window.innerWidth * 0.8))));
      dibujarQR(lienzo, dibujo(indice), { ancho: lado });
      contador.textContent = `Código ${indice + 1} de ${marcos.length}`;
    };
    const avanzar = () => {
      if (!terminado && !pausado) {
        pintar();
        indice = (indice + 1) % marcos.length;
      }
      temporizador = setTimeout(avanzar, 1000 / VELOCIDADES[velocidad].fps);
    };
    const parar = () => {
      terminado = true;
      clearTimeout(temporizador);
    };

    const ventana = abrirVentana({
      titulo: 'Código QR',
      subtitulo: `${nombre} · ${marcos.length} código${marcos.length === 1 ? '' : 's'}, se repiten en bucle`,
      ancho: 'grande',
      sinCerrarFuera: true,
      contenido: h(
        'div',
        { class: 'qr-vista' },
        lienzo,
        contador,
        h('p', { class: 'nota' }, 'En el otro aparato: Recibir → Escanear código QR. Deja las dos tablets quietas, con el brillo al máximo, y espera a que llegue al último.'),
        h(
          'div',
          { class: 'qr-controles' },
          botonPausa,
          h('button', { class: 'btn', onclick: () => { velocidad = Math.max(0, velocidad - 1); etiquetaVel.textContent = VELOCIDADES[velocidad].nombre; } }, 'Más lento'),
          etiquetaVel,
          h('button', { class: 'btn', onclick: () => { velocidad = Math.min(VELOCIDADES.length - 1, velocidad + 1); etiquetaVel.textContent = VELOCIDADES[velocidad].nombre; } }, 'Más rápido')
        )
      ),
      acciones: [
        { texto: 'Cerrar sin confirmar', onclick: () => { parar(); resolver(false); } },
        { texto: 'Ya lo recibieron', tipo: 'primario', onclick: () => { parar(); resolver(true); } },
      ],
      alCerrar: () => { parar(); resolver(false); },
    });
    void ventana;
    avanzar();
  });
}
