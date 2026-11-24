// Recorrido: al entrar a la plantilla y al hacer un cambio se pregunta con qué posición juega la jugadora (como en Roots).
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { servir } from './servidor.mjs';
import { mkdirSync } from 'node:fs';
const RAIZ = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? '/tmp/e2e-posicion';
mkdirSync(SHOTS, { recursive: true });
const { s, puerto } = await servir(RAIZ);
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errores.push('console: ' + m.text()));
const ok = (c, msg) => { if (!c) { errores.push('FALLA: ' + msg); console.log('FALLA:', msg); } else console.log('ok:', msg); };
const est = () => page.evaluate(() => structuredClone(window.__roots.partidos.get(10).est));
const pausa = (ms = 250) => page.waitForTimeout(ms);
const dialogo = '[data-pregunta-posicion]';

await page.goto(`http://127.0.0.1:${puerto}/`);
await page.waitForSelector('.vacio');
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('.vacio .btn-primario')]);
await chooser.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.waitForSelector('.ventana');
await page.click('.ventana-pie .btn-primario');
await page.waitForSelector('.partido-tarjeta');
await page.click('.partido-tarjeta:has-text("Águilas")');
await page.waitForSelector('.formato');
await page.click('text=Mejor de 3');
await page.waitForSelector('.cancha');

// 1) Un toque en una jugadora de la lista: pregunta la posición, con la de su ficha sugerida
const filas = page.locator('.fila-jugador');
await filas.nth(0).click();
await page.waitForSelector(dialogo);
await pausa(400);
await page.screenshot({ path: SHOTS + '/01-pregunta.png' });
ok((await page.locator(dialogo + ' .opcion').count()) === 5, 'ofrece las 5 posiciones');
ok(await page.locator(dialogo + ' .opcion.principal').getAttribute('data-posicion') === 'Colocación', 'la sugerida es la de su ficha (Valentina: Colocación)');
ok((await page.textContent(dialogo + ' .opcion.principal')).includes('Su ficha'), 'la sugerida dice "Su ficha"');
ok((await page.textContent('.ventana-titulo')).includes('Ríos'), 'el título dice de quién se trata (V. Ríos)');

// 2) Cancelar: no entra a la cancha
await page.click('.ventana-fondo:not(.saliendo) .ventana-cabeza .btn-icono');
await pausa();
ok((await est()).actual.slots.filter(Boolean).length === 0, 'si se cancela la pregunta, no entra a la cancha');

// 3) Elegir otra posición distinta de la ficha: Valentina juega de Central
await filas.nth(0).click();
await page.click(dialogo + ' .opcion[data-posicion="Central"]');
await pausa();
let e = await est();
ok(e.actual.slots[0] === 1 && e.posiciones[1] === 'Central', 'entra a P1 con la posición elegida (Central)');
ok((await page.locator('.casilla .rol-pill').first().textContent()) === 'Cen', 'la casilla muestra la posición (Cen)');
ok((await page.textContent('.fila-jugador:has-text("Valentina") small')).includes('Central (ficha: Colocación)'), 'la lista muestra Central (ficha: Colocación)');

// 4) Las demás con la sugerida
for (let i = 1; i < 6; i++) {
  await filas.nth(i).click();
  await page.click(dialogo + ' .opcion.principal');
  await pausa(120);
}
e = await est();
ok(e.actual.slots.filter(Boolean).length === 6, 'seis en cancha');

// 5) Cancha llena: no pregunta, avisa
await filas.nth(6).click();
await pausa();
ok((await page.locator(dialogo).count()) === 0 && (await page.locator('.toast-error').count()) >= 1, 'con la cancha llena no pregunta y avisa que no caben más');

// 6) Quitar con un toque no pregunta
await filas.nth(5).click();
await pausa();
ok((await page.locator(dialogo).count()) === 0 && (await est()).actual.slots.filter(Boolean).length === 5, 'quitar a alguien de la cancha no pregunta');
await filas.nth(5).click();
await page.click(dialogo + ' .opcion.principal');
await pausa();

// 7) Cambiar la posición desde su casilla
await page.locator('.casilla').nth(1).click(); // fila de atrás de la derecha o izquierda según la cancha
await page.waitForSelector('.ventana-fondo:not(.saliendo) .opcion:has-text("Cambiar su posición")');
await page.screenshot({ path: SHOTS + '/02-casilla.png' });
await page.click('.opcion:has-text("Cambiar su posición")');
await page.waitForSelector(dialogo);
const quien = await page.textContent('.ventana-fondo:not(.saliendo):last-of-type .ventana-titulo');
await page.click(dialogo + ' .opcion[data-posicion="Ataque opuesto"]');
await pausa();
e = await est();
ok(Object.values(e.posiciones).includes('Ataque opuesto'), `cambia su posición sin moverla de lugar (${quien})`);
ok(e.actual.slots.filter(Boolean).length === 6, 'sigue habiendo seis en cancha');

// 8) Líbero (no pregunta) y confirmar
await page.click('text=Un líbero');
await page.click('.cupo button');
await page.waitForSelector('.ventana .opcion');
await page.locator('.ventana .opcion').filter({ hasText: /Líbero/ }).first().click();
await pausa();
ok((await page.locator(dialogo).count()) === 0, 'elegir a la líbero no pregunta posición');
await pausa(400);
await page.screenshot({ path: SHOTS + '/03-armada.png' });
await page.click('text=Confirmar plantilla');
await page.waitForSelector('.rotacion');
e = await est();
const filasT = e.actual.titulares;
ok(filasT.find((t) => t.jugadorId === 1).posicionJugada === 'Central', 'al confirmar, Valentina queda con posicionJugada Central');
ok(filasT.filter((t) => !t.esLibero).every((t) => typeof t.posicionJugada === 'string'), 'todas las titulares llevan su posición');
ok(filasT.filter((t) => t.esLibero).every((t) => t.posicionJugada === null), 'la líbero no lleva posición');

// 9) Acciones: Valentina juega de Central, así que no tiene Colocación pero sí Bloqueo
await page.click('.tabs >> text=Acciones');
await page.waitForSelector('.fila-circulos');
await page.locator('.jugador-btn', { hasText: 'Ríos' }).click();
const fundamentos = await page.$$eval('.btn-fund', (b) => b.map((x) => x.textContent));
ok(!fundamentos.includes('Colocación') && fundamentos.includes('Bloqueo'), `fundamentos de una central: ${fundamentos.join(', ')}`);
await page.screenshot({ path: SHOTS + '/04-acciones.png' });

// 10) Cambio: pregunta la posición con que entra y la guarda; Deshacer la devuelve
await page.click('.tabs >> text=Plantilla');
await page.locator('.casilla').nth(3).click();
await page.click('.opcion:has-text("Hacer un cambio")');
await page.locator('.ventana-fondo:not(.saliendo) .opcion').nth(0).click();
await page.waitForSelector(dialogo);
await pausa(400);
await page.screenshot({ path: SHOTS + '/05-cambio.png' });
ok((await page.textContent(dialogo + ' .ventana-texto')).startsWith('Entra'), 'la pregunta del cambio dice quién entra por quién');
await page.click(dialogo + ' .opcion[data-posicion="Colocación"]');
await pausa();
e = await est();
const cambio = e.actual.sustituciones.find((x) => !x.porLibero);
ok(cambio?.posicionEntra === 'Colocación' && e.posiciones[cambio.jugadorEntraId] === 'Colocación', 'el cambio guarda con qué posición entró');
await page.click('.b-deshacer');
await pausa();
e = await est();
ok(e.actual.sustituciones.length === 0 && e.posiciones[cambio.jugadorEntraId] === undefined, 'Deshacer devuelve el cambio y la posición');

// 11) El archivo de resultados las lleva
await page.evaluate(() => { const r = window.__roots.partidos.get(10); r.est.actual.puntosLocal = 25; r.est.actual.puntosVisitante = 20; });
await page.click('.b-menu');
await page.click('text=Terminar set 1');
await page.waitForSelector('.stepper');
await page.click('.ventana-pie .btn-primario');
await pausa(400);
const guardado = await est();
ok(guardado.sets[0].titulares.find((t) => t.jugadorId === 1).posicionJugada === 'Central', 'el set guardado conserva la posición con que jugó');

console.log(errores.length ? 'ERRORES:\n' + errores.join('\n') : 'TODO BIEN');
await navegador.close();
s.close();
process.exit(errores.length ? 1 : 0);
