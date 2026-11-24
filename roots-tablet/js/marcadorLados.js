// De qué lado de la pantalla va cada equipo en el marcador.
//   invertido: la persona quiere el marcador al revés (por ejemplo, zurdas).
//   sigue:     el marcador cambia de lado solo cuando los equipos cambian de cancha.
// Los equipos cambian de lado después de cada set, y en el set decisivo al llegar a 8 puntos (ya avisado por la app).
const CLAVE = 'roots-marcador';

export function leerPreferenciasMarcador(almacen = globalThis.localStorage) {
  try {
    const p = JSON.parse(almacen.getItem(CLAVE) ?? '{}');
    return { invertido: p.invertido === true, sigue: p.sigue === true };
  } catch {
    return { invertido: false, sigue: false };
  }
}

export function guardarPreferenciasMarcador(prefs, almacen = globalThis.localStorage) {
  try {
    almacen.setItem(CLAVE, JSON.stringify({ invertido: prefs.invertido === true, sigue: prefs.sigue === true }));
  } catch {
    /* sin almacenamiento local: vale solo para esta sesión */
  }
}

// true = el marcador se dibuja con el visitante a la izquierda.
export function marcadorInvertido(prefs, { setsGuardados = 0, cambioCanchaHecho = false, esSetDecisivo = false } = {}) {
  let cambiados = false;
  if (prefs.sigue) {
    cambiados = setsGuardados % 2 === 1; // set 2, 4...: los equipos están del otro lado
    if (esSetDecisivo && cambioCanchaHecho) cambiados = !cambiados; // cambio de cancha a los 8 puntos
  }
  return prefs.invertido !== cambiados;
}
