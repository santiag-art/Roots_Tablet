import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { CARACTERES_POR_MARCO, ErrorMarcos, MAX_MARCOS, ReceptorMarcos, crc32, crearMarcos } from '../js/qr/marcos.js';
import { capacidadBytes, crearQR } from '../js/qr/codigoQR.js';

const MUESTRA = readFileSync(new URL('./fixtures/muestra-roots.json', import.meta.url), 'utf8');
const grande = () => JSON.stringify({ aplicacion: 'roots-tablet-resultados', eventos: Array.from({ length: 4000 }, (_, i) => ({ orden: i, jugadorId: i % 12, fundamento: ['Saque', 'Recepción', 'Ataque'][i % 3], calificacion: (i * 7) % 5, creadoEn: `2026-11-22T10:${String(i % 60).padStart(2, '0')}:00.000Z`, ruido: (i * 2654435761) % 997 })) });

async function recibirTodo(marcos, orden = (x) => x) {
  const r = new ReceptorMarcos();
  for (const m of orden(marcos)) r.aceptar(m);
  return r;
}

test('un archivo pasa por marcos y vuelve idéntico (texto con tildes y ñ incluido)', async () => {
  const texto = MUESTRA.replace('Roots', 'Roots ñandú áéíóú 🏐');
  const marcos = await crearMarcos(texto);
  const r = await recibirTodo(marcos);
  assert.ok(r.completo);
  assert.equal(await r.texto(), texto);
});

test('los marcos caben en un QR pequeño y el archivo grande se comprime', async () => {
  const texto = grande();
  const marcos = await crearMarcos(texto);
  assert.ok(marcos.length < texto.length / CARACTERES_POR_MARCO / 2, `${marcos.length} marcos para ${texto.length} caracteres`);
  for (const m of marcos) {
    assert.ok(m.length <= 520, `un marco mide ${m.length}`);
    assert.ok(m.length <= capacidadBytes(15, 'L'));
  }
  const qr = crearQR(marcos[0], { nivel: 'L' });
  assert.ok(qr.version <= 15);
  assert.equal(await (await recibirTodo(marcos)).texto(), texto);
});

test('los marcos pueden llegar desordenados, repetidos y mezclados con otros QR', async () => {
  const texto = grande();
  const marcos = await crearMarcos(texto);
  const r = new ReceptorMarcos();
  const baraja = [...marcos].reverse();
  const vistos = [];
  for (const m of [...baraja, ...baraja.slice(0, 5), 'https://ejemplo.com', 'hola']) vistos.push(r.aceptar(m).tipo);
  assert.equal(vistos.filter((t) => t === 'completo').length, 1);
  assert.ok(vistos.includes('repetido'));
  assert.ok(vistos.includes('ignorado'));
  assert.equal(await r.texto(), texto);
});

test('el progreso dice cuántos marcos van y cuáles faltan', async () => {
  const marcos = await crearMarcos(grande());
  const r = new ReceptorMarcos();
  assert.deepEqual(r.aceptar(marcos[0]), { tipo: 'nuevo', recibidos: 1, total: marcos.length });
  r.aceptar(marcos[2]);
  assert.deepEqual(r.faltan.slice(0, 2), [2, 4]);
  await assert.rejects(() => r.texto(), ErrorMarcos);
});

test('si empieza otro envío, se descarta el anterior', async () => {
  const a = await crearMarcos(grande(), { id: 'aaaa' });
  const b = await crearMarcos(MUESTRA, { id: 'bbbb' });
  const r = new ReceptorMarcos();
  r.aceptar(a[0]);
  r.aceptar(a[1]);
  for (const m of b) r.aceptar(m);
  assert.equal(r.id, 'bbbb');
  assert.equal(await r.texto(), MUESTRA);
});

test('una lectura dañada se detecta con la suma de comprobación', async () => {
  const marcos = await crearMarcos(grande());
  const malo = [...marcos];
  const k = Math.floor(malo.length / 2);
  const datos = malo[k].split('.').pop();
  malo[k] = malo[k].slice(0, -datos.length) + (datos[0] === 'A' ? 'B' : 'A') + datos.slice(1);
  await assert.rejects(async () => (await recibirTodo(malo)).texto(), /errores/);
});

test('un marco con otro total o mal formado no se mezcla', async () => {
  const marcos = await crearMarcos(grande(), { id: 'zzzz' });
  const r = new ReceptorMarcos();
  r.aceptar(marcos[0]);
  const raro = marcos[1].replace(`.${marcos.length}.`, `.${marcos.length + 1}.`);
  assert.equal(r.aceptar(raro).tipo, 'ignorado');
  assert.equal(r.aceptar('RT1.zzzz.9999.10.1.abcd1234.AAAA').tipo, 'ignorado');
  assert.equal(r.aceptar('RT1.zzzz.1.2.1.xyz.AAAA').tipo, 'ignorado');
});

test('un archivo enorme se rechaza con un mensaje claro en vez de generar cientos de QR', async () => {
  const ruido = randomBytes(350000).toString('hex'); // 700000 caracteres que no se comprimen mucho
  await assert.rejects(() => crearMarcos(ruido), (e) => e instanceof ErrorMarcos && /Drive/.test(e.message) && MAX_MARCOS > 0);
});

test('crc32 coincide con el valor conocido', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 'cbf43926');
});
