import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { servir } from './servidor.mjs';
import { mkdirSync } from 'node:fs';
const RAIZ = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? '/tmp/claude-0/-home-claude/d6ed882e-87da-5ef6-a2d8-ae4657841370/scratchpad/e2e';
mkdirSync(SHOTS, { recursive: true });
const { s, puerto } = await servir(RAIZ);
const url = `http://127.0.0.1:${puerto}/`;
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
// Estos recorridos no prueban el detalle de los puntos del rival (lo cubre e2e/puntoRival.mjs): se apaga para que no abra la ventana.
await page.addInitScript(() => localStorage.setItem('roots-detalle-rival', JSON.stringify({ activo: false })));
const errores = [];
page.on('pageerror', (e) => { console.log('PAGEERR', e.message); errores.push('pageerror: ' + e.message); });
page.on('console', (m) => m.type() === 'error' && errores.push('console: ' + m.text()));
const foto = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` });
const ok = (c, msg) => { if (!c) { errores.push('FALLA: ' + msg); console.log('FALLA:', msg); } else console.log('ok:', msg); };

await page.goto(url);
await page.waitForSelector('.vacio');
await foto('01-vacio');

// Importar
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.vacio .btn-primario')]);
await chooser.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.waitForSelector('.ventana');
await foto('02-importado');
await page.click('.ventana-pie .btn-primario');
await page.waitForSelector('.partido-tarjeta');
ok((await page.$$('.partido-tarjeta')).length === 3, '3 partidos importados');
await foto('03-lista');

// Nuevo partido creado en la tablet
await page.click('.inicio-acciones button:has-text("Nuevo partido")');
await page.waitForSelector('.formulario');
await foto('03a-nuevo-partido');
await page.click('.formulario .chip:has-text("Copa Pereira Masculina")');
await page.click('.formulario .chip:has-text("Halcones")'); // rival ya conocido: un toque
ok(await page.inputValue('.formulario input[type=text]') === 'Halcones', 'el rival conocido se llena con un toque');
await page.click('.formulario .segmentos button:has-text("Visitante")');
await foto('03b-nuevo-partido-lleno');
await page.click('.ventana-pie .btn-primario');
await page.waitForSelector('.formato');
const nuevo = await page.evaluate(() => [...window.__roots.partidos.values()].find((p) => p.creadoEnTablet));
ok(nuevo && nuevo.id >= 1e9 && nuevo.equipoLocal === 'Halcones' && nuevo.equipoVisitante === 'Roots' && nuevo.est.ladoPropio === 'visitante', 'partido creado en la tablet (Roots visitante)');
await page.click('.b-atras');
await page.waitForSelector('.partido-tarjeta');
ok((await page.$$('.partido-tarjeta')).length === 4 && await page.locator('text=Creado en la tablet').count() === 1, 'aparece en la lista con su etiqueta');
await foto('03c-lista-con-nuevo');
// Validación: sin rival no deja crear
await page.click('.inicio-acciones button:has-text("Nuevo partido")');
await page.click('.formulario .chip:has-text("Copa Pereira Femenina")');
await page.click('.ventana-pie .btn-primario');
ok(await page.locator('.toast-error').count() >= 1 && await page.locator('.formulario').count() === 1, 'sin rival no crea y la ventana sigue abierta');
await page.click('.ventana-cabeza .btn-icono');

// Abrir partido 10 (femenino, sin formato)
await page.click('.partido-tarjeta:has-text("Águilas")');
await page.waitForSelector('.formato');
await foto('04-formato');
await page.click('text=Mejor de 3');
await page.waitForSelector('.cancha');
await foto('05-plantilla-vacia');

// Armar 6 en cancha
const filas = page.locator('.fila-jugador');
// Cada jugadora que entra a la cancha pregunta con qué posición juega: se acepta la sugerida (la de su ficha).
for (let i = 0; i < 6; i++) {
  await filas.nth(i).click();
  await page.click('[data-pregunta-posicion] .opcion.principal');
}
await page.click('text=Un líbero');
await page.click('.cupo button');
await page.waitForSelector('.ventana .opcion');
// elegir un líbero (jugadora id 7)
await page.locator('.ventana .opcion').filter({ hasText: /Líbero/ }).first().click();
await foto('06-armada');
await page.click('text=Confirmar plantilla');
await page.waitForSelector('.rotacion');
await foto('07-confirmada');
ok(await page.locator('.rotacion').count() === 1, 'plantilla confirmada');

// Saque y puntos
await page.click('.eq-visitante .chip-saque');
await page.click('.puntos-v .btn-punto.mas');
await page.click('.puntos-l .btn-punto.mas');
await foto('08-puntos');
const rot = await page.textContent('.rotacion .centro strong');
console.log('rotación:', rot);
ok(/Rotación 2/.test(rot), 'rotó al recuperar el saque');

// Acciones
await page.click('.tabs >> text=Acciones');
await page.waitForSelector('.fila-circulos');
await page.locator('.jugador-btn').nth(1).click();
await page.click('.btn-fund >> nth=0');
await foto('09-acciones');
await page.click('.btn-calif.calif-positivo');
ok(await page.locator('.lista-jugadas div').count() >= 1, 'jugada registrada');
await foto('10-jugada');

// Deshacer
await page.click('.b-deshacer');

// Subir marcador a 25-0 con atajo del estado (rápido) y terminar set por UI
await page.evaluate(() => {
  const reg = window.__roots.partidos.get(10);
  reg.est.actual.puntosLocal = 25; reg.est.actual.puntosVisitante = 20;
});
await page.click('.tabs >> text=Plantilla');
await page.click('.b-menu');
await page.click('text=Terminar set 1');
await page.waitForSelector('.stepper');
await foto('11-terminar-set');
await page.click('.ventana-pie .btn-primario');
await page.waitForTimeout(300);
await foto('12-set2');
ok(/1 - 0/.test(await page.textContent('.sets-g')), 'set 1 guardado');

// Recargar: persistencia
await page.reload();
await page.waitForSelector('.barra');
ok(/1 - 0/.test(await page.textContent('.sets-g')), 'persiste tras recargar');

// Resumen para compartir (imagen, PDF y vista previa)
await page.click('.tabs button:has-text("Resumen")');
await page.waitForSelector('.resumen-compartir');
await foto('14a-resumen-compartir');
await page.click('.resumen-compartir button:has-text("Ver vista previa")');
await page.waitForSelector('.resumen-vista-previa');
ok(await page.evaluate(() => document.querySelector('.resumen-vista-previa').naturalWidth) === 1080, 'vista previa del resumen (1080 px de ancho)');
await page.locator('.resumen-vista-previa').scrollIntoViewIfNeeded();
await foto('14b-resumen-vista-previa');
const [descPdf] = await Promise.all([page.waitForEvent('download'), page.click('.resumen-compartir button:has-text("Descargar PDF")')]);
const rutaPdf = await descPdf.path();
const { readFileSync } = await import('node:fs');
ok(readFileSync(rutaPdf).subarray(0, 5).toString() === '%PDF-' && /resumen-.*\.pdf$/.test(descPdf.suggestedFilename()), `PDF del resumen descargado (${descPdf.suggestedFilename()})`);
const [descPng] = await Promise.all([page.waitForEvent('download'), page.click('.resumen-compartir button:has-text("Descargar imagen")')]);
ok(readFileSync(await descPng.path()).subarray(1, 4).toString() === 'PNG', 'imagen PNG del resumen descargada');
await page.click('.tabs button:has-text("Plantilla")');

// Corregir marcador del set 1 (25-20 -> 25-22) y reabrir
await page.click('.b-menu');
await page.click('text=Corregir sets guardados');
await page.click('.opcion:has-text("Set 1: 25-20")');
await page.waitForSelector('.stepper');
await page.click('.stepper .lado >> nth=1 >> .btn-punto >> nth=1');
await page.click('.stepper .lado >> nth=1 >> .btn-punto >> nth=1');
await foto('15-corregir');
await page.click('.ventana-pie .btn-primario');
await page.waitForTimeout(250);
ok(await page.evaluate(() => window.__roots.partidos.get(10).est.sets[0].puntosVisitante) === 22, 'marcador corregido a 25-22');
await page.click('.b-menu');
await page.click('text=Corregir sets guardados');
await page.click('text=Reabrir el set 1');
await page.locator('.ventana-pie .btn-primario').last().click();
await page.waitForTimeout(300);
ok(/0 - 0/.test(await page.textContent('.sets-g')), 'set 1 reabierto');
ok(await page.evaluate(() => window.__roots.partidos.get(10).est.actual.puntosLocal) === 25, 'marcador del set reabierto');
ok(await page.evaluate(() => window.__roots.partidos.get(10).est.actual.rotaciones) === 1, 'rotación 2 de 6 vuelve igual al reabrir');
await foto('16-reabierto');
await page.evaluate(() => { const e = window.__roots.partidos.get(10).est; });
await page.click('.b-menu');
await page.click('text=Terminar set 1');
await page.click('.ventana-pie .btn-primario');
await page.waitForTimeout(300);

// Exportar
await page.click('.b-atras');
await page.click('text=Resultados');
await page.waitForSelector('.opcion');
await foto('13-exportar');
await page.click('.opcion');
const [descarga] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.btn-primario:has-text("Exportar")'); await page.click('.ventana-fondo:not(.saliendo) >> text=Guardar en la tablet'); })()].map((p, i) => p)).catch(async () => [null]);
await page.waitForTimeout(500);
await foto('14-exportar-ok');
console.log('descarga:', descarga ? descarga.suggestedFilename() : 'ninguna');

console.log('\nERRORES:', errores);
await navegador.close();
s.close();
process.exit(errores.length ? 1 : 0);
