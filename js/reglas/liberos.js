// Líberos: ninguno, uno (único) o dos (recepción y defensa). Copia de frontend/src/utils/liberos.js sin las clases de Tailwind:
// los colores viven en css/app.css (--lib-unico, --lib-recepcion, --lib-defensa), distintos a los de la cancha.
export const TIPOS_LIBERO_POR_MODO = {
  ninguno: [],
  uno: ['unico'],
  dos: ['recepcion', 'defensa'],
};

export const INFO_LIBERO = {
  unico: { nombre: 'Líbero', corto: 'L', descripcion: 'Entra por P1, P5 o P6, sin contar como cambio' },
  recepcion: { nombre: 'Líbero de recepción', corto: 'LR', descripcion: 'Recibe el saque rival' },
  defensa: { nombre: 'Líbero de defensa', corto: 'LD', descripcion: 'Defiende el ataque rival' },
};

// Casillas (índice 0 = P1) donde puede estar un líbero: P1 (solo al recibir; al rotar sale), P5 y P6. Nunca en la delantera.
export const INDICES_LIBERO = [0, 4, 5];
