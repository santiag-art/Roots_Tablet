// Reloj del tiempo muerto (30 s). Vive fuera de la pantalla del partido para no reiniciarse al redibujar.
// Empieza en pantalla completa; "Seguir el partido" lo reduce a un reloj flotante que sigue corriendo (se toca para
// ampliarlo otra vez). Suena a los 10 s y al terminar, y vibra si la tablet puede.
import { avanceReloj, faseDelReloj, formatoReloj, SEGUNDOS_TIEMPO_MUERTO, segundosRestantes, sonidosAlPasar } from '../cronometro.js';
import { h } from './dom.js';

let activo = null;

function pitidos(audio, cantidad, tono = 880) {
  try {
    if (!audio) return;
    audio.resume?.();
    for (let i = 0; i < cantidad; i++) {
      const t = audio.currentTime + i * 0.25;
      const osc = audio.createOscillator();
      const gan = audio.createGain();
      osc.frequency.value = tono;
      gan.gain.value = 0.25;
      osc.connect(gan).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.18);
    }
  } catch {
    /* sin sonido */
  }
}

const vibrar = (patron) => {
  try {
    navigator.vibrate?.(patron);
  } catch {
    /* sin vibración */
  }
};

export function cerrarTiempoMuerto() {
  if (!activo) return;
  clearInterval(activo.reloj);
  document.removeEventListener('visibilitychange', activo.alVolver);
  activo.el.remove();
  activo.pastilla.remove();
  activo.audio?.close?.().catch?.(() => {});
  activo = null;
}

// onDevolver: se llama si la persona toca "Me equivoqué" (devuelve el tiempo muerto).
export function iniciarTiempoMuerto({ equipo, segundos = SEGUNDOS_TIEMPO_MUERTO, onDevolver }) {
  cerrarTiempoMuerto();
  const fin = Date.now() + segundos * 1000;
  let restante = segundos;
  let audio = null;
  try {
    // Se crea aquí, dentro del toque que pidió el tiempo muerto, para que el navegador deje sonar después.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audio = Ctx ? new Ctx() : null;
    audio?.resume?.();
  } catch {
    audio = null;
  }

  const cuenta = h('div', { class: 'cuenta', 'aria-live': 'off' }, String(restante));
  const botonSeguir = h('button', { class: 'btn btn-grande btn-primario' }, 'Seguir el partido');
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
        botonSeguir,
        onDevolver ? h('button', { class: 'btn btn-grande', onclick: () => { cerrarTiempoMuerto(); onDevolver(); } }, 'Me equivoqué, devolver') : null
      )
    )
  );

  const textoPastilla = h('span', { class: 'tm-tiempo' }, formatoReloj(restante));
  const pastilla = h(
    'div',
    { class: 'tm-pastilla', hidden: true, role: 'status', 'aria-label': `Tiempo muerto de ${equipo}` },
    h('button', { class: 'tm-ampliar', 'aria-label': 'Ampliar el reloj del tiempo muerto', onclick: () => mostrar(false) }, h('span', { class: 'tm-anillo' }), h('span', { class: 'tm-texto' }, h('small', {}, `TM · ${equipo}`), textoPastilla)),
    h('button', { class: 'tm-cerrar', 'aria-label': 'Cerrar el reloj', onclick: cerrarTiempoMuerto }, '×')
  );

  function mostrar(pequeno) {
    el.hidden = pequeno;
    pastilla.hidden = !pequeno;
  }

  botonSeguir.onclick = () => {
    if (restante <= 0) cerrarTiempoMuerto(); // ya terminó: se va
    else mostrar(true); // sigue corriendo, pero se puede usar la app
  };

  function pintar() {
    const antes = restante;
    restante = segundosRestantes(fin, Date.now());
    cuenta.textContent = String(restante);
    textoPastilla.textContent = restante <= 0 ? '¡Terminó!' : formatoReloj(restante);
    const fase = faseDelReloj(restante);
    for (const nodo of [cuenta, pastilla]) nodo.dataset.fase = fase;
    cuenta.classList.toggle('fin', fase === 'fin');
    pastilla.style.setProperty('--avance', `${Math.round(avanceReloj(restante, segundos) * 360)}deg`);
    if (restante <= 0) botonSeguir.textContent = 'Seguir el partido';
    else botonSeguir.textContent = 'Seguir el partido (el reloj sigue)';
    for (const sonido of sonidosAlPasar(antes, restante)) {
      if (sonido === 'diez') { pitidos(audio, 1, 660); vibrar(120); }
      else { pitidos(audio, 3); vibrar([250, 120, 250, 120, 250]); if (!pastilla.hidden) pastilla.classList.add('sonando'); }
    }
    if (restante <= 0) clearInterval(activo?.reloj);
  }

  document.body.append(el, pastilla);
  const reloj = setInterval(pintar, 250);
  const alVolver = () => { if (!document.hidden) pintar(); }; // al despertar la tablet, se pone al día
  document.addEventListener('visibilitychange', alVolver);
  activo = { el, pastilla, reloj, audio, alVolver };
  pintar();
}
