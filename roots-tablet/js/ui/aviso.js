// Avisos y ventanas: toast, confirmar, y una ventana genérica para elegir/llenar algo.
// Todo con botones grandes y sin teclado (la tablet no tiene).
import { h, icono } from './dom.js';

let capaToast = null;

function asegurarCapaToast() {
  if (!capaToast) {
    capaToast = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(capaToast);
  }
  return capaToast;
}

// tipo: 'info' | 'ok' | 'error'
export function toast(mensaje, tipo = 'info', ms = tipo === 'error' ? 7000 : 2500) {
  const capa = asegurarCapaToast();
  const cierre = h('button', { class: 'toast-cerrar', 'aria-label': 'Cerrar aviso', onclick: () => quitar() }, icono('cerrar', { tam: 18 }));
  const el = h('div', { class: `toast toast-${tipo}`, role: tipo === 'error' ? 'alert' : null }, h('span', { class: 'toast-texto' }, mensaje), cierre);
  let hecho = false;
  const quitar = () => {
    if (hecho) return;
    hecho = true;
    el.classList.add('saliendo');
    setTimeout(() => el.remove(), 180);
  };
  capa.append(el);
  while (capa.children.length > 3) capa.firstChild.remove();
  setTimeout(quitar, ms);
  return quitar;
}

// ─────────────── Ventana genérica ───────────────
// opciones: { titulo, subtitulo, contenido (Node | (cerrar) => Node), acciones: [{ texto, tipo, onclick, cerrar=true, deshabilitado }], ancho, alCerrar }
// Devuelve { cerrar, el, cuerpo }.
export function abrirVentana(opciones) {
  const { titulo, subtitulo, contenido, acciones = [], ancho = 'media', alCerrar = null, sinCerrarFuera = false } = opciones;
  const fondo = h('div', { class: 'ventana-fondo' });
  const anteriorFoco = document.activeElement;
  let cerrada = false;
  const manejo = {
    el: fondo,
    cuerpo: null,
    cerrar(resultado) {
      if (cerrada) return;
      cerrada = true;
      document.removeEventListener('keydown', alTeclear);
      fondo.classList.add('saliendo');
      setTimeout(() => fondo.remove(), 140);
      anteriorFoco?.focus?.();
      alCerrar?.(resultado);
    },
  };
  const alTeclear = (e) => {
    if (e.key === 'Escape' && !sinCerrarFuera) manejo.cerrar();
  };
  document.addEventListener('keydown', alTeclear);

  const cuerpo = h('div', { class: 'ventana-cuerpo' }, typeof contenido === 'function' ? contenido(manejo.cerrar) : contenido);
  manejo.cuerpo = cuerpo;
  const pie = acciones.length
    ? h(
        'div',
        { class: 'ventana-pie' },
        acciones.map((a) =>
          h(
            'button',
            {
              class: `btn ${a.tipo === 'primario' ? 'btn-primario' : a.tipo === 'peligro' ? 'btn-peligro' : 'btn-fantasma'}`,
              disabled: a.deshabilitado,
              onclick: async () => {
                const sigue = await a.onclick?.(manejo);
                if (a.cerrar !== false && sigue !== false) manejo.cerrar(a.valor);
              },
            },
            a.texto
          )
        )
      )
    : null;

  const ventana = h(
    'div',
    { class: `ventana ventana-${ancho}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': titulo ?? 'Ventana' },
    h(
      'div',
      { class: 'ventana-cabeza' },
      h('div', {}, titulo ? h('h2', { class: 'ventana-titulo' }, titulo) : null, subtitulo ? h('p', { class: 'ventana-sub' }, subtitulo) : null),
      sinCerrarFuera ? null : h('button', { class: 'btn-icono', 'aria-label': 'Cerrar', onclick: () => manejo.cerrar() }, icono('cerrar'))
    ),
    cuerpo,
    pie
  );
  fondo.append(ventana);
  if (!sinCerrarFuera) fondo.addEventListener('pointerdown', (e) => e.target === fondo && manejo.cerrar());
  document.body.append(fondo);
  return manejo;
}

// ¿Seguro? -> Promise<boolean>
export function confirmar({ titulo, texto, si = 'Sí', no = 'Cancelar', peligro = false }) {
  return new Promise((resolver) => {
    abrirVentana({
      titulo,
      contenido: h('p', { class: 'ventana-texto' }, texto),
      ancho: 'chica',
      acciones: [
        { texto: no, onclick: () => resolver(false) },
        { texto: si, tipo: peligro ? 'peligro' : 'primario', onclick: () => resolver(true) },
      ],
      alCerrar: () => resolver(false),
    });
  });
}

// Mensaje con un solo botón.
export function informar({ titulo, texto, boton = 'Entendido' }) {
  return new Promise((resolver) => {
    abrirVentana({
      titulo,
      contenido: typeof texto === 'string' ? h('p', { class: 'ventana-texto' }, texto) : texto,
      ancho: 'chica',
      acciones: [{ texto: boton, tipo: 'primario', onclick: () => resolver() }],
      alCerrar: () => resolver(),
    });
  });
}
