// Utilidades para las pruebas: un torneo de ejemplo con 12 jugadoras y un reloj controlado.
import { nuevoEstadoPartido } from '../js/motor.js';

export const JUGADORAS = [
  { id: 1, nombre: 'Ana Colocadora', numero: 1, posicion: 'Colocación', genero: 'femenino' },
  { id: 2, nombre: 'Bea Punta', numero: 2, posicion: 'Atacante', genero: 'femenino' },
  { id: 3, nombre: 'Cami Central', numero: 3, posicion: 'Central', genero: 'femenino' },
  { id: 4, nombre: 'Dani Opuesta', numero: 4, posicion: 'Ataque opuesto', genero: 'femenino' },
  { id: 5, nombre: 'Eli Punta', numero: 5, posicion: 'Atacante', genero: 'femenino' },
  { id: 6, nombre: 'Fer Central', numero: 6, posicion: 'Central', genero: 'femenino' },
  { id: 7, nombre: 'Gabi Líbero', numero: 7, posicion: 'Líbero', genero: 'femenino' },
  { id: 8, nombre: 'Hanna Líbero', numero: 8, posicion: 'Líbero', genero: 'femenino' },
  { id: 9, nombre: 'Isa Banca', numero: 9, posicion: 'Atacante', genero: 'femenino' },
  { id: 10, nombre: 'Juli Banca', numero: 10, posicion: 'Central', genero: 'femenino' },
  { id: 11, nombre: 'Kata Banca', numero: 11, posicion: 'Colocación', genero: 'femenino' },
  { id: 12, nombre: 'Lau Banca', numero: 12, posicion: 'Atacante', genero: 'femenino' },
];

export function crearContexto({ lesiones = new Map() } = {}) {
  let reloj = Date.parse('2026-11-22T10:00:00Z');
  const avisos = [];
  return {
    jugadores: JUGADORAS,
    lesiones,
    avisos,
    ahora: () => new Date((reloj += 1000)),
    avisar: (tipo, texto) => avisos.push({ tipo, texto }),
  };
}

export function partidoDePrueba(extra = {}) {
  return { id: 10, torneoId: 1, equipoLocal: 'Roots', equipoVisitante: 'Rivales', fecha: '2026-11-22', hora: '09:00:00', formatoSets: 'mejor_de_3', ...extra };
}

export function estadoNuevo(extra) {
  return nuevoEstadoPartido(partidoDePrueba(extra));
}
