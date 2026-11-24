// Arrastrar y soltar con eventos de puntero: funciona igual con dedo, lápiz y mouse
// (el arrastre nativo de HTML5 no funciona en pantallas táctiles).
//
// - Quien se puede arrastrar llama a iniciarArrastre(e, payload, etiqueta, alSoltar) en su `onpointerdown`
//   y lleva la clase `arrastrable` (así el dedo no hace scroll).
// - Quien recibe lleva data-destino="algo"; mientras se arrastra el destino bajo el dedo se resalta.
// - alSoltar(payload, destino) se llama al soltar; destino es null si fue fuera de todo destino.
// Un movimiento de menos de UMBRAL_PX es un toque normal: el click sigue su curso.
import { h } from './dom.js';

const UMBRAL_PX = 8;

export function iniciarArrastre(e, payload, etiqueta, alSoltar) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let activo = false;
  let fantasma = null;
  let marcado = null;

  const destinoEn = (x, y) => document.elementFromPoint(x, y)?.closest('[data-destino]') ?? null;
  const resaltar = (el) => {
    if (el === marcado) return;
    marcado?.classList.remove('destino-activo');
    marcado = el;
    marcado?.classList.add('destino-activo');
  };

  const limpiar = () => {
    window.removeEventListener('pointermove', mover);
    window.removeEventListener('pointerup', soltar);
    window.removeEventListener('pointercancel', cancelar);
    document.body.classList.remove('arrastrando');
    resaltar(null);
    fantasma?.remove();
    fantasma = null;
  };

  function mover(ev) {
    if (!activo) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < UMBRAL_PX) return;
      activo = true;
      document.body.classList.add('arrastrando');
      fantasma = h('div', { class: 'fantasma-arrastre', 'aria-hidden': 'true' }, etiqueta);
      document.body.append(fantasma);
    }
    fantasma.style.left = `${ev.clientX}px`;
    fantasma.style.top = `${ev.clientY}px`;
    resaltar(destinoEn(ev.clientX, ev.clientY));
  }

  function terminar(ev, cancelado) {
    const eraArrastre = activo;
    const destino = eraArrastre && !cancelado ? destinoEn(ev.clientX, ev.clientY)?.getAttribute('data-destino') ?? null : null;
    limpiar();
    if (!eraArrastre) return; // fue un toque
    // El navegador dispara un click al soltar: se anula para no activar el botón de origen.
    const bloquear = (c) => c.stopPropagation();
    window.addEventListener('click', bloquear, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', bloquear, { capture: true }), 0);
    if (!cancelado) alSoltar?.(payload, destino);
  }
  const soltar = (ev) => terminar(ev, false);
  const cancelar = (ev) => terminar(ev, true);

  window.addEventListener('pointermove', mover);
  window.addEventListener('pointerup', soltar);
  window.addEventListener('pointercancel', cancelar);
}
