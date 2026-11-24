// Falta de posición (regla 7.5 FIVB 2025-2028): al momento del saque, cada jugadora debe estar en la posición que le
// corresponde según el orden de rotación. Funciones puras para poder probarlas solas.
//
// Las formaciones son arreglos de 6 ids en orden de posición (índice 0 = P1, el saque ... índice 5 = P6), igual que
// los `slots` de la pantalla en vivo. Un id null/undefined significa "casilla sin indicar".

// Compara la formación que hay en la cancha (declarada) con la que marca la rotación (esperada).
// Devuelve { correcta, diferencias: [{ posicion, esperadoId, encontradoId }] } (posicion de 1 a 6).
export function revisarFormacion({ esperada, declarada }) {
  const diferencias = [];
  for (let i = 0; i < 6; i += 1) {
    const esperadoId = esperada?.[i] ?? null;
    const encontradoId = declarada?.[i] ?? null;
    if (esperadoId !== encontradoId) diferencias.push({ posicion: i + 1, esperadoId, encontradoId });
  }
  return { correcta: diferencias.length === 0, diferencias };
}

// Texto de cada diferencia. `nombre(id)` devuelve el nombre a mostrar.
export function describirDiferencia({ posicion, esperadoId, encontradoId }, nombre) {
  if (encontradoId == null) return `P${posicion}: falta indicar quién está; por la rotación debe estar ${nombre(esperadoId)}.`;
  return `P${posicion}: por la rotación debe estar ${nombre(esperadoId)} y está ${nombre(encontradoId)}.`;
}

// Mensaje de aviso para una formación con diferencias (null si coincide).
export function avisoFaltaDePosicion(resultado, nombre) {
  if (resultado.correcta) return null;
  const detalle = resultado.diferencias.map((d) => describirDiferencia(d, nombre)).join(' ');
  return `Falta de posición (regla 7.5): la formación no coincide con el orden de rotación. ${detalle}`;
}

// Quien saca debe ser quien está en P1 (regla 7.7, falta de rotación). Devuelve el mensaje o null.
export function avisoSacadorFueraDeRotacion({ sacadorId, esperadoP1Id }, nombre) {
  if (sacadorId == null || esperadoP1Id == null || sacadorId === esperadoP1Id) return null;
  return `Saque fuera de rotación (reglas 7.5 y 7.7): por la rotación saca ${nombre(esperadoP1Id)} (P1), no ${nombre(sacadorId)}. Revisa la formación.`;
}
