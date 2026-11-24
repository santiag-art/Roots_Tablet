import test from 'node:test';
import assert from 'node:assert/strict';
import { avanceReloj, faseDelReloj, formatoReloj, segundosRestantes, sonidosAlPasar } from '../js/cronometro.js';

test('los segundos salen de la hora real y no bajan de 0', () => {
  assert.equal(segundosRestantes(30_000, 0), 30);
  assert.equal(segundosRestantes(30_000, 100), 30); // aún no pasó un segundo entero
  assert.equal(segundosRestantes(30_000, 1_000), 29);
  assert.equal(segundosRestantes(30_000, 29_001), 1);
  assert.equal(segundosRestantes(30_000, 30_000), 0);
  assert.equal(segundosRestantes(30_000, 99_000), 0); // la tablet durmió: no queda negativo
});

test('fases del reloj', () => {
  assert.deepEqual([30, 11, 10, 6, 5, 1, 0].map(faseDelReloj), ['normal', 'normal', 'ambar', 'ambar', 'rojo', 'rojo', 'fin']);
});

test('sonidos: uno a los 10 s y tres al terminar, aunque se salte un segundo', () => {
  assert.deepEqual(sonidosAlPasar(11, 10), ['diez']);
  assert.deepEqual(sonidosAlPasar(12, 9), ['diez']); // se saltó el 10
  assert.deepEqual(sonidosAlPasar(10, 9), []);
  assert.deepEqual(sonidosAlPasar(1, 0), ['fin']);
  assert.deepEqual(sonidosAlPasar(25, 0), ['fin']); // durmió casi todo el tiempo: solo suena el final
  assert.deepEqual(sonidosAlPasar(0, 0), []);
  assert.deepEqual(sonidosAlPasar(30, 29), []);
});

test('formato y avance', () => {
  assert.deepEqual([30, 9, 0].map(formatoReloj), ['0:30', '0:09', '0:00']);
  assert.equal(avanceReloj(30), 0);
  assert.equal(avanceReloj(15), 0.5);
  assert.equal(avanceReloj(0), 1);
});
