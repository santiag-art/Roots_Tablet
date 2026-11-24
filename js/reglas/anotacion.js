// Catálogo de fundamentos y calificaciones usados al anotar jugadas en vivo.
// Cuando haya backend, esto es la tabla `tipos_accion` que ya definimos
// (nombre, fundamento, valor).
export const FUNDAMENTOS = ['Ataque', 'Saque', 'Recepción', 'Colocación', 'Bloqueo', 'Defensa'];

// Regla 19.3.1.3 (FIVB 2025-2028): el líbero no puede sacar ni bloquear, así que no se le registran esas jugadas.
export const FUNDAMENTOS_PROHIBIDOS_LIBERO = ['Saque', 'Bloqueo'];

export const CALIFICACIONES = [
  { value: 'doble_positivo', label: 'Doble positivo', estilo: 'bg-emerald-50 text-emerald-600 border-emerald-200' },
  { value: 'positivo', label: 'Positivo', estilo: 'bg-emerald-50/60 text-emerald-600 border-emerald-100' },
  { value: 'negativo', label: 'Negativo', estilo: 'bg-amber-50 text-amber-600 border-amber-200' },
  { value: 'error', label: 'Error', estilo: 'bg-red-50 text-red-500 border-red-200' },
];
