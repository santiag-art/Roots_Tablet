// Posiciones de la cancha de voleibol y su rotación.
//
// El arreglo de 6 casillas va en orden de posición: índice 0 = posición 1 (saque),
// 1 = posición 2, ... 5 = posición 6. Vista desde el lado propio de la red:
//
//        RED
//   P4   P3   P2     (delanteras)
//   P5   P6   P1     (zagueras; P1 es quien saca)
//
export const NUM_POSICIONES = 6;

export const FILAS_CANCHA = [
  { clave: 'delantera', titulo: 'Delanteras', posiciones: [4, 3, 2] },
  { clave: 'zaguera', titulo: 'Zagueras', posiciones: [5, 6, 1] },
];

// Rotación reglamentaria (sentido de las manecillas): quien está en P2 pasa a P1,
// P1 a P6, P6 a P5, P5 a P4, P4 a P3 y P3 a P2. Con pasos negativos se devuelve.
export function rotar(slots, pasos = 1) {
  const n = slots.length;
  const desplazamiento = ((pasos % n) + n) % n;
  return slots.map((_, i) => slots[(i + desplazamiento) % n]);
}

// Las 6 formaciones posibles, empezando por la que se pasa (rotación 1).
export function todasLasRotaciones(slots) {
  return Array.from({ length: slots.length }, (_, k) => rotar(slots, k));
}

// De las filas guardadas en titulares_set (sin la líbero) arma las 6 casillas.
// Las filas sin posición (datos antiguos) llenan los huecos en el orden en que se registraron.
export function slotsDesdeTitulares(titularesCancha) {
  const slots = Array(NUM_POSICIONES).fill(null);
  const sinPosicion = [];
  [...titularesCancha]
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .forEach((t) => {
      const p = Number(t.posicion);
      if (Number.isInteger(p) && p >= 1 && p <= NUM_POSICIONES && slots[p - 1] == null) slots[p - 1] = t.jugadorId;
      else sinPosicion.push(t.jugadorId);
    });
  sinPosicion.forEach((jugadorId) => {
    const libre = slots.indexOf(null);
    if (libre >= 0) slots[libre] = jugadorId;
  });
  return slots;
}

// Aplica las sustituciones en orden; el cambio es por jugador, así que no depende de la rotación.
export function aplicarSustituciones(slots, sustituciones) {
  // La designación de un nuevo líbero (regla 19.4) no mueve a nadie en cancha.
  const ordenadas = [...sustituciones].filter((s) => !s.nuevoLibero).sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
  let resultado = slots;
  for (const s of ordenadas) {
    resultado = resultado.map((id) => (id === s.jugadorSaleId ? s.jugadorEntraId : id));
  }
  return resultado;
}

// Quién está "fuera" por culpa de un líbero: Map libero -> jugador al que reemplazó en cancha.
// Se recorren en orden los cambios de líbero (porLibero): si entra un líbero, reemplaza a quien sale;
// si sale, el reemplazado vuelve y deja de estar fuera.
export function reemplazadosPorLibero(sustituciones, idsLibero) {
  const mapa = new Map();
  [...sustituciones]
    .filter((s) => s.porLibero)
    .sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en) || (a.id ?? 0) - (b.id ?? 0))
    .forEach((s) => {
      const entraLibero = idsLibero.includes(s.jugadorEntraId);
      const saleLibero = idsLibero.includes(s.jugadorSaleId);
      if (entraLibero && saleLibero) {
        // Cambio de un líbero por el otro: el que entra hereda a la jugadora que estaba fuera.
        const fuera = mapa.get(s.jugadorSaleId);
        mapa.delete(s.jugadorSaleId);
        if (fuera != null) mapa.set(s.jugadorEntraId, fuera);
      } else if (entraLibero) mapa.set(s.jugadorEntraId, s.jugadorSaleId);
      else if (saleLibero) mapa.delete(s.jugadorSaleId);
    });
  return mapa;
}

export function nombrePosicion(posicion) {
  return { 1: 'Saque', 2: 'Delantera derecha', 3: 'Delantera central', 4: 'Delantera izquierda', 5: 'Zaguera izquierda', 6: 'Zaguera central' }[posicion] ?? '';
}
