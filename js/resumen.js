// Textos y cuentas que se repiten en varias pantallas (lista de partidos, exportar, barra del partido).
import { estaTerminado, partidoDecidido, setsComoMarcador, setEnCursoTieneDatos, todosLosEventos } from './motor.js';
import { contarSetsGanados } from './reglas/voleibol.js';

// 'pendiente' (sin empezar) | 'en_juego' (algo anotado) | 'terminado' (decidido o cerrado a mano)
export function estadoDePartido(registro) {
  const est = registro.est;
  if (estaTerminado(est)) return 'terminado';
  if (est.sets.length > 0 || setEnCursoTieneDatos(est)) return 'en_juego';
  return 'pendiente';
}

export function marcadorDeSets(est) {
  const { local, visitante } = contarSetsGanados(setsComoMarcador(est));
  return { local, visitante };
}

export function textoDeSets(est) {
  return est.sets.map((s) => `${s.puntosLocal}-${s.puntosVisitante}`).join(' · ');
}

// Línea de estado corta para la tarjeta del partido.
export function textoDeEstado(registro) {
  const est = registro.est;
  const estado = estadoDePartido(registro);
  const { local, visitante } = marcadorDeSets(est);
  if (estado === 'pendiente') return 'Sin empezar';
  if (estado === 'terminado') return `Terminado · sets ${local}-${visitante}`;
  const a = est.actual;
  const enCurso = a.puntosLocal + a.puntosVisitante > 0 ? ` · ${a.puntosLocal}-${a.puntosVisitante}` : '';
  return `En juego · set ${est.sets.length + 1}${enCurso}`;
}

// El set en curso no se exporta: se avisa cuando tiene datos y el partido no se terminó.
export function tieneSetSinTerminar(registro) {
  return !partidoDecidido(registro.est) && setEnCursoTieneDatos(registro.est);
}

export function cantidadDeJugadas(registro) {
  return todosLosEventos(registro.est).length;
}

export function fechaCorta(fecha) {
  if (!fecha) return '';
  const d = new Date(`${fecha}T00:00`);
  return Number.isNaN(d.getTime()) ? fecha : d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function horaCorta(hora) {
  return hora ? String(hora).slice(0, 5) : '';
}

export function hoyISO(d = new Date()) {
  const dos = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

export function ordenarPorFechaHora(a, b) {
  return `${a.fecha} ${a.hora}`.localeCompare(`${b.fecha} ${b.hora}`) || a.id - b.id;
}
