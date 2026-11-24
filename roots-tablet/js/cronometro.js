// Cuenta regresiva del tiempo muerto: cálculos puros (sin pantalla) para poder probarlos.
export const SEGUNDOS_TIEMPO_MUERTO = 30;

// Segundos que faltan, calculados con la hora real (no sumando ticks): si la tablet baja el brillo o suspende la
// pestaña un rato, al volver el reloj sigue exacto.
export function segundosRestantes(fin, ahora) {
  return Math.max(0, Math.ceil((fin - ahora) / 1000));
}

// Color del reloj: normal, ámbar en los últimos 10 s, rojo en los últimos 5 s y 'fin' al llegar a 0.
export function faseDelReloj(restante) {
  if (restante <= 0) return 'fin';
  if (restante <= 5) return 'rojo';
  if (restante <= 10) return 'ambar';
  return 'normal';
}

// Sonidos que tocan al pasar de `antes` a `ahora` segundos: uno corto a los 10 s y tres al terminar. Mira lo que se
// cruzó (no el valor exacto), así que si se saltó un segundo no se pierde el aviso.
export function sonidosAlPasar(antes, ahora) {
  const sonidos = [];
  if (antes > 10 && ahora <= 10 && ahora > 0) sonidos.push('diez');
  if (antes > 0 && ahora <= 0) sonidos.push('fin');
  return sonidos;
}

export const formatoReloj = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Avance del anillo (0 a 1) de lo que ya pasó.
export const avanceReloj = (restante, total = SEGUNDOS_TIEMPO_MUERTO) => Math.min(1, Math.max(0, 1 - restante / total));
