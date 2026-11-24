import test from 'node:test';
import assert from 'node:assert/strict';
import { leerPreferenciasMarcador, guardarPreferenciasMarcador, marcadorInvertido } from '../js/marcadorLados.js';

const memoria = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
};

test('por defecto el marcador no se invierte', () => {
  const p = leerPreferenciasMarcador(memoria());
  assert.deepEqual(p, { invertido: false, sigue: false });
  assert.equal(marcadorInvertido(p, { setsGuardados: 1 }), false);
});

test('invertir a mano (zurdas) no depende del set', () => {
  const p = { invertido: true, sigue: false };
  assert.equal(marcadorInvertido(p, { setsGuardados: 0 }), true);
  assert.equal(marcadorInvertido(p, { setsGuardados: 1 }), true);
});

test('seguir el cambio de cancha: cambia de lado en cada set', () => {
  const p = { invertido: false, sigue: true };
  assert.equal(marcadorInvertido(p, { setsGuardados: 0 }), false);
  assert.equal(marcadorInvertido(p, { setsGuardados: 1 }), true);
  assert.equal(marcadorInvertido(p, { setsGuardados: 2 }), false);
});

test('seguir el cambio de cancha: en el set decisivo cambia a los 8 puntos', () => {
  const p = { invertido: false, sigue: true };
  assert.equal(marcadorInvertido(p, { setsGuardados: 2, esSetDecisivo: true, cambioCanchaHecho: false }), false);
  assert.equal(marcadorInvertido(p, { setsGuardados: 2, esSetDecisivo: true, cambioCanchaHecho: true }), true);
});

test('invertir a mano y seguir la cancha se combinan', () => {
  const p = { invertido: true, sigue: true };
  assert.equal(marcadorInvertido(p, { setsGuardados: 0 }), true);
  assert.equal(marcadorInvertido(p, { setsGuardados: 1 }), false);
});

test('las preferencias se guardan y se leen; un valor roto no falla', () => {
  const a = memoria();
  guardarPreferenciasMarcador({ invertido: true, sigue: true }, a);
  assert.deepEqual(leerPreferenciasMarcador(a), { invertido: true, sigue: true });
  assert.deepEqual(leerPreferenciasMarcador({ getItem: () => '{roto' }), { invertido: false, sigue: false });
  assert.deepEqual(leerPreferenciasMarcador({ getItem: () => { throw new Error('x'); } }), { invertido: false, sigue: false });
});
