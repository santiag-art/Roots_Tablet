import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { servir } from './servidor.mjs';
const RAIZ = new URL('..', import.meta.url).pathname;
const SHOTS = '/tmp/claude-0/-home-claude/d6ed882e-87da-5ef6-a2d8-ae4657841370/scratchpad/e2e';
const { s, puerto } = await servir(RAIZ);
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 800 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
// Estos recorridos no prueban el detalle de los puntos del rival (lo cubre e2e/puntoRival.mjs): se apaga para que no abra la ventana.
await page.addInitScript(() => localStorage.setItem('roots-detalle-rival', JSON.stringify({ activo: false })));
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
page.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text()));
const ok = (c, m) => { console.log(c ? 'ok:' : 'FALLA:', m); if (!c) errs.push('FALLA ' + m); };
const est = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__roots.partidos.get(20).est)));
const esperar = (ms = 250) => page.waitForTimeout(ms);

await page.goto(`http://127.0.0.1:${puerto}/`);
await page.waitForSelector('.vacio');
const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('.vacio .btn-primario')]);
await ch.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.click('.ventana-fondo:not(.saliendo) .ventana-pie .btn-primario');
// importar otra vez el mismo archivo: no duplica
const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('text=Importar archivo')]);
await ch2.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.waitForSelector('.ventana:not(.saliendo) >> text=Ya habías importado', { timeout: 5000 }).then(() => ok(true, 'reimportar avisa que ya estaba')).catch(() => ok(false, 'reimportar avisa que ya estaba'));
await page.click('.ventana-fondo:not(.saliendo) .ventana-pie .btn-primario');
await esperar();
ok((await page.$$('.partido-tarjeta')).length === 3, 'sin duplicados');

// Titanes (tiene 1 set en Roots) pide confirmación
await page.click('.partido-tarjeta:has-text("Titanes")');
await page.waitForSelector('.ventana');
ok(/Roots ya tiene sets/.test(await page.textContent('.ventana')), 'avisa que Roots ya tiene sets');
await page.locator('.ventana-fondo:not(.saliendo) .ventana-pie .btn').first().click();
await esperar();

await page.click('.partido-tarjeta:has-text("Halcones")');
await page.waitForSelector('.cancha');
ok((await est()).formatoSets === 'mejor_de_5', 'formato mejor de 5 viene del archivo');
const filas = page.locator('.fila-jugador');
for (let i = 0; i < 6; i++) {
  await filas.nth(i).click();
  await page.click('[data-pregunta-posicion] .opcion.principal'); // acepta la posición sugerida
}
await page.click('text=Dos líberos');
const cupos = page.locator('.cupo');
async function elegirLibero(n, patron) {
  await cupos.nth(n).locator('button').first().click();
  await page.locator('.ventana-fondo:not(.saliendo) .opcion').filter({ hasText: patron }).nth(n).click();
  await esperar();
}
await elegirLibero(0, /Líbero/);
await elegirLibero(1, /Líbero/);
await page.screenshot({ path: SHOTS + '/30-dos-liberos.png' });
await page.click('text=Confirmar plantilla');
await page.waitForSelector('.rotacion');
let e = await est();
ok(e.actual.plantillaConfirmada && e.actual.titulares.length === 8, '6 + 2 líberos confirmados');

// saque visitante y punto nuestro: rota
await page.click('.eq-visitante .chip-saque');
await page.click('.puntos-l .btn-punto.mas');
ok((await est()).actual.rotaciones === 1, 'rotó');

// Libero entra por zaguera desde su cupo
await page.locator('.cupo').first().locator('button:has-text("Entrar")').click();
await page.locator('.ventana-fondo:not(.saliendo) .opcion').last().click();
await esperar();
e = await est();
console.log('TOAST:', await page.evaluate(() => document.querySelector('.toasts')?.textContent)); await page.screenshot({ path: SHOTS + '/dbg4.png' });
ok(e.actual.sustituciones.some((x) => x.porLibero), 'entró el líbero');
await page.screenshot({ path: SHOTS + '/31-libero-dentro.png' });
// y sale
await page.click('.puntos-v .btn-punto.mas');
await page.locator('.cupo').first().locator('button:has-text("Salir")').click();
await esperar();
console.log('TOAST2:', await page.evaluate(() => document.querySelector('.toasts')?.textContent));
ok((await est()).actual.sustituciones.filter((x) => x.porLibero).length === 2, 'salió el líbero');

// cambio desde la casilla (P4)
await page.locator('.casilla').first().click();
await esperar(600); 
await page.click('.opcion:has-text("Hacer un cambio")');
await page.locator('.ventana-fondo:not(.saliendo) .opcion').nth(0).click();
await page.waitForSelector('[data-pregunta-posicion]'); // pregunta con qué posición entra
await page.click('[data-pregunta-posicion] .opcion[data-posicion="Central"]');
await esperar();
ok((await est()).actual.sustituciones.filter((x) => !x.porLibero).length === 1, 'cambio registrado');
ok((await est()).actual.sustituciones.find((x) => !x.porLibero).posicionEntra === 'Central', 'el cambio guarda con qué posición entró');

// tiempo muerto y "me equivoqué"
await page.click('.eq-local .chip-tm');
await page.waitForSelector('.tm-overlay');
await page.screenshot({ path: SHOTS + '/32-tm.png' });
ok((await est()).actual.tiemposMuertos.local === 1, 'tiempo muerto contado');
await page.click('text=Me equivoqué');
await esperar();
ok((await est()).actual.tiemposMuertos.local === 0 && (await page.$('.tm-overlay')) === null, 'tiempo muerto devuelto');

// rotaciones y verificación
await page.click('text=Ver rotaciones');
await page.waitForSelector('.mini-rot');
ok((await page.$$('.mini-rot')).length === 6, '6 rotaciones');
await page.click('.ventana-fondo:not(.saliendo) .btn-icono');
await esperar(300);
await page.click('text=Verificar formación');
await page.click('.ventana-fondo:not(.saliendo) .ventana-pie .btn-primario');
ok(/coincide/.test(await page.textContent('.ventana')), 'formación verificada');
await page.click('.ventana-fondo:not(.saliendo) .ventana-pie .btn-fantasma');
await esperar(300);

// Terminar partido por UI: 3 sets
async function cerrarSet(l, v) {
  await page.evaluate(([l, v]) => { const r = window.__roots.partidos.get(20).est.actual; r.puntosLocal = l; r.puntosVisitante = v; }, [l, v]);
  await page.click('.tabs >> text=Plantilla');
  await page.click('.b-menu');
  await page.click('.opcion:has-text("Terminar set")');
  await page.waitForSelector('.stepper');
  await page.locator('.ventana-fondo:not(.saliendo) .ventana-pie .btn-primario').last().click();
  await esperar(300);
}
await cerrarSet(25, 10);
ok((await est()).sets.length === 1, 'set 1');
// plantilla pasa al siguiente set sin confirmar
ok(!(await est()).actual.plantillaConfirmada, 'set 2 sin plantilla confirmada');
await page.screenshot({ path: SHOTS + '/33-set2-plantilla.png' });
await page.click('text=Confirmar plantilla');
await cerrarSet(25, 12);
await page.click('text=Confirmar plantilla').catch(() => {});
await cerrarSet(25, 14);
ok((await est()).sets.length === 3, '3 sets');
await page.waitForSelector('.aviso-ok');
ok(/Partido terminado/.test(await page.textContent('.avisos')), 'partido terminado automáticamente');
await page.screenshot({ path: SHOTS + '/34-terminado.png' });
// no deja anotar
ok(await page.locator('.btn-punto.mas').first().isDisabled(), 'marcador bloqueado al terminar');

// tema claro
await page.click('.b-menu');
await page.click('text=Tema claro');
await esperar(300);
await page.screenshot({ path: SHOTS + '/35-claro.png' });
await page.click('.b-atras');

// Exportar: dejarlos y luego quitarlos
await page.click('text=Resultados');
await page.waitForSelector('.opcion');
ok((await page.$$('.opcion')).length === 1, 'solo Halcones exportable (Titanes tiene 0 sets locales)');
const [d1] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.btn-primario:has-text("Exportar")'); await page.click('.ventana-fondo:not(.saliendo) >> text=Guardar en la tablet'); })()]);
const ruta = await d1.path();
const archivo = JSON.parse(await (await import('node:fs/promises')).readFile(ruta, 'utf8'));
ok(archivo.partidos[0].sets.length === 3 && archivo.partidos[0].finalizadoManual === true, 'archivo con 3 sets y finalizado');
await page.waitForSelector('.ventana');
await page.locator('.ventana-fondo:not(.saliendo) .ventana-pie .btn').first().click(); // No, dejarlos
await esperar(300);
ok((await page.evaluate(() => window.__roots.partidos.has(20))), 'se queda en la tablet si no confirmas');
await page.screenshot({ path: SHOTS + '/36-resultados.png' });
const [d2] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.btn-primario:has-text("Exportar")'); await page.click('.ventana-fondo:not(.saliendo) >> text=Guardar en la tablet'); })()]);
await page.waitForSelector('.ventana');
await page.locator('.ventana-fondo:not(.saliendo) .ventana-pie .btn').last().click(); // Sí, quitarlos
await esperar(400);
ok(!(await page.evaluate(() => window.__roots.partidos.has(20))), 'se quita al confirmar');

console.log('\nERRORES:', errs);
await nav.close(); s.close();
process.exit(errs.length ? 1 : 0);
