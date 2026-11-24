// Cuenta regresiva de 30 s del tiempo muerto. Vive fuera de la pantalla del partido para no reiniciarse al redibujar.
import { h } from './dom.js';

let activo = null;

function pitido() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = ctx.createOscillator();
      const gan = ctx.createGain();
      osc.frequency.value = 880;
      gan.gain.value = 0.25;
      osc.connect(gan).connect(ctx.destination);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + 0.18);
    });
    setTimeout(() => ctx.close(), 1200);
  } catch {
    /* sin sonido */
  }
}

export function cerrarTiempoMuerto() {
  if (!activo) return;
  clearInterval(activo.reloj);
  activo.el.remove();
  activo = null;
}

// onDevolver: se llama si la persona toca "Me equivoqué" (devuelve el tiempo muerto).
export function iniciarTiempoMuerto({ equipo, segundos = 30, onDevolver }) {
  cerrarTiempoMuerto();
  let restante = segundos;
  const cuenta = h('div', { class: 'cuenta', 'aria-live': 'off' }, String(restante));
  const el = h(
    'div',
    { class: 'tm-overlay', role: 'dialog', 'aria-label': 'Tiempo muerto' },
    h(
      'div',
      {},
      h('h2', {}, `Tiempo muerto · ${equipo}`),
      cuenta,
      h(
        'div',
        { class: 'botones' },
        h('button', { class: 'btn btn-grande btn-primario', onclick: cerrarTiempoMuerto }, 'Seguir el partido'),
        onDevolver
          ? h('button', { class: 'btn btn-grande', onclick: () => { cerrarTiempoMuerto(); onDevolver(); } }, 'Me equivoqué, devolver')
          : null
      )
    )
  );
  document.body.append(el);
  const reloj = setInterval(() => {
    restante -= 1;
    cuenta.textContent = String(Math.max(0, restante));
    if (restante <= 0) {
      clearInterval(reloj);
      cuenta.classList.add('fin');
      pitido();
    }
  }, 1000);
  activo = { el, reloj };
}
