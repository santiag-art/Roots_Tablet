// Recorrido: al sumarle un punto al rival se pregunta cómo anotó (ataque con zonas, saque, bloqueo, error), se puede omitir,
// se apaga desde el menú, se deshace junto con el punto y se ve en la pestaña Resumen.
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { servir } from './servidor.mjs';
import { mkdirSync } from 'node:fs';
const RAIZ = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? '/tmp/e2e-punto-rival';
mkdirSync(SHOTS, { recursive: true });
const { s, puerto } = await servir(RAIZ);
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 960, height: 700 }, hasTouch: true, acceptDownloads: true });
const page = await ctx.newPage();
const errores = [];
page.on('pageerror', (e) => errores.push('pageerror: ' + e.message));
page.on('console', (m) => m.type() === 'error' && errores.push('console: ' + m.text()));
const ok = (c, msg) => { if (!c) { errores.push('FALLA: ' + msg); console.log('FALLA:', msg); } else console.log('ok:', msg); };
const est = () => page.evaluate(() => structuredClone(window.__roots.partidos.get(10).est));
const pausa = (ms = 250) => page.waitForTimeout(ms);
const ventana = '[data-punto-rival]';

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

const propio = (await est()).ladoPropio;
const rival = propio === 'local' ? 'v' : 'l';
const nuestro = propio === 'local' ? 'l' : 'v';
const masRival = `.puntos-${rival} .btn-punto.mas`;
const detalle = async (i) => (await est()).actual.puntosInfo[i]?.detalle;

// 1) Un punto nuestro no pregunta nada
await page.click(`.puntos-${nuestro} .btn-punto.mas`);
await pausa();
ok((await page.locator(ventana).count()) === 0, 'un punto nuestro no abre la ventana');

// 2) Un punto del rival pregunta el motivo
await page.click(masRival);
await page.waitForSelector(ventana);
await pausa(300);
await page.screenshot({ path: SHOTS + '/01-motivo.png' });
ok((await page.locator(ventana + ' .opcion').count()) === 4, 'ofrece 4 motivos (ataque, saque, bloqueo, error)');

// 3) Ataque: pide zona de salida y zona de caída; con las dos guarda solo
await page.click(ventana + ' [data-motivo="ataque"]');
await page.waitForSelector(ventana + ' .cancha-zonas');
await pausa(300);
await page.screenshot({ path: SHOTS + '/02-zonas.png' });
ok((await page.locator(ventana + ' .cancha-zonas').count()) === 2, 'muestra las dos canchas (desde y cayó en)');
ok((await page.locator(ventana + ' .cancha-zonas >> nth=0 >> .zona.apagada').count()) === 1, 'en "desde" la zona 5 queda apagada');
await page.click(ventana + ' .cancha-zonas >> nth=0 >> [data-zona="4"]');
await pausa(150);
ok((await page.locator(ventana).count()) === 1, 'con solo la zona de salida sigue abierta');
await page.click(ventana + ' .cancha-zonas >> nth=1 >> [data-zona="1"]');
await pausa(300);
ok((await page.locator(ventana).count()) === 0, 'con las dos zonas se guarda y se cierra');
ok(JSON.stringify(await detalle(1)) === JSON.stringify({ motivo: 'ataque', desde: 4, hacia: 1 }), 'queda guardado: ataque desde 4, cayó en 1');

// 4) Saque directo: un toque guarda
await page.click(masRival);
await page.waitForSelector(ventana);
await page.click(ventana + ' [data-motivo="saque"]');
await pausa(300);
ok(JSON.stringify(await detalle(2)) === JSON.stringify({ motivo: 'saque' }), 'saque directo guarda con un toque');

// 5) Ataque sin zonas
await page.click(masRival);
await page.waitForSelector(ventana);
await page.click(ventana + ' [data-motivo="ataque"]');
await page.click(ventana + ' [data-guardar-ataque]');
await pausa(300);
ok(JSON.stringify(await detalle(3)) === JSON.stringify({ motivo: 'ataque' }), 'ataque "sin zonas" guarda solo el motivo');

// 6) Omitir deja el punto sin detalle
await page.click(masRival);
await page.waitForSelector(ventana);
await page.click('.ventana-fondo:not(.saliendo) .ventana-pie .btn');
await pausa(300);
let e = await est();
ok(e.actual.puntosVisitante + e.actual.puntosLocal === 5 && (await detalle(4)) === undefined, 'Omitir deja el punto sumado y sin detalle');

// 7) Otro ataque con zonas (para el resumen) y Deshacer lo quita junto con el punto
await page.click(masRival);
await page.waitForSelector(ventana);
await page.click(ventana + ' [data-motivo="ataque"]');
await page.click(ventana + ' .cancha-zonas >> nth=1 >> [data-zona="5"]');
await page.click(ventana + ' .cancha-zonas >> nth=0 >> [data-zona="4"]');
await pausa(300);
ok(JSON.stringify(await detalle(5)) === JSON.stringify({ motivo: 'ataque', desde: 4, hacia: 5 }), 'se puede tocar primero dónde cayó y luego de dónde salió');
await page.click('.b-deshacer');
await pausa(300);
e = await est();
ok(e.actual.puntosSeq.length === 5 && e.actual.puntosInfo.length === 5, 'Deshacer quita el punto con su detalle');
await page.click(masRival);
await page.waitForSelector(ventana);
await page.click(ventana + ' [data-motivo="ataque"]');
await page.click(ventana + ' .cancha-zonas >> nth=0 >> [data-zona="4"]');
await page.click(ventana + ' .cancha-zonas >> nth=1 >> [data-zona="5"]');
await pausa(300);

// 8) Resumen: tarjeta "Cómo anota"
await page.click('.tabs button:has-text("Resumen")');
await page.waitForSelector('[data-tarjeta-rival]');
await page.locator('[data-tarjeta-rival]').scrollIntoViewIfNeeded();
await pausa(300);
await page.screenshot({ path: SHOTS + '/03-resumen.png' });
const texto = await page.textContent('[data-tarjeta-rival]');
ok(texto.includes('Cómo anota'), 'el Resumen tiene la tarjeta "Cómo anota <rival>"');
ok(/Ataque\s*3/.test(texto) && /Saque directo\s*1/.test(texto), 'cuenta 3 ataques y 1 saque directo');
ok(texto.includes('Ataca más desde la zona 4'), 'dice desde qué zona ataca más');
ok(texto.includes('4 → 1') && texto.includes('4 → 5'), 'lista las trayectorias');
ok(texto.includes('1 de 5 puntos del rival sin detalle') || texto.includes('1 de 5'), 'avisa cuántos puntos quedaron sin detalle');
ok((await page.locator('.mapa-calor').count()) === 1, 'el Resumen muestra el mapa de calor de la cancha');
ok((await page.locator('.mapa-calor [data-mapa="desde"][data-zona="4"]').getAttribute('data-n')) === '2', 'mapa: desde la zona 4 salieron 2 ataques');
ok((await page.locator('.mapa-calor [data-mapa="hacia"][data-zona="1"]').getAttribute('data-n')) === '1' && (await page.locator('.mapa-calor [data-mapa="hacia"][data-zona="5"]').getAttribute('data-n')) === '1', 'mapa: cayó 1 en la zona 1 y 1 en la zona 5');
ok((await page.locator('.mapa-calor [data-cruce]').count()) === 2, 'mapa: dibuja las 2 trayectorias');
await page.locator('.mapa-calor').scrollIntoViewIfNeeded();
await pausa(200);
await page.screenshot({ path: SHOTS + '/03b-mapa.png' });
await page.click('[data-tarjeta-rival] .segmentos button >> nth=1');
await pausa(200);
ok((await page.textContent('[data-tarjeta-rival]')).includes('Todos vs'), 'se puede ver "Todos vs rival"');

// 9) Apagarlo desde el menú
await page.click('.tabs button:has-text("Acciones")');
await page.click('button[aria-label*="Menú"], .b-menu');
await page.waitForSelector('.ventana .opcion');
await page.click('.ventana .opcion:has-text("Detalle de los puntos del rival")');
await pausa(200);
await page.keyboard.press('Escape');
await pausa(200);
await page.click(masRival);
await pausa(300);
ok((await page.locator(ventana).count()) === 0, 'con el detalle apagado no se pregunta nada');
await page.screenshot({ path: SHOTS + '/04-apagado.png' });

// 10) Historial por rival: desde el Resumen, desde el inicio y de vuelta al partido
await page.click('.tabs button:has-text("Resumen")');
await page.waitForSelector('[data-ver-historial]');
await page.click('[data-ver-historial]');
await page.waitForSelector('.mapa-calor');
await pausa(300);
ok(page.url().includes('#/rival/'), 'el botón del Resumen abre la pantalla del rival');
ok((await page.textContent('.inicio-titulo h1')).includes('Águilas'), 'la pantalla muestra el nombre del rival');
ok((await page.textContent('.inicio-titulo p')).includes('1 partido'), 'dice cuántos partidos hay contra el rival');
ok((await page.locator('.mapa-calor [data-mapa="desde"][data-zona="4"]').getAttribute('data-n')) === '2', 'el mapa del rival junta sus ataques (zona 4: 2)');
ok((await page.locator('.inicio-cuerpo [data-partido]').count()) === 1, 'lista el partido jugado contra el rival');
await page.screenshot({ path: SHOTS + '/05-rival.png' });
await page.click('.inicio-cabeza .btn-icono');
await page.waitForSelector('[data-lista-rivales]');
ok((await page.locator('[data-lista-rivales] [data-rival]').count()) >= 1, 'la lista de rivales muestra a los equipos jugados');
await page.screenshot({ path: SHOTS + '/06-rivales.png' });
await page.click('.inicio-cabeza .btn-icono');
await page.waitForSelector('[data-ir-rivales]');
await page.click('[data-ir-rivales]');
await page.waitForSelector('[data-lista-rivales]');
await page.click('[data-lista-rivales] [data-rival]:has-text("Águilas")');
await page.waitForSelector('.mapa-calor');
await page.click('.inicio-cuerpo [data-partido]');
await page.waitForSelector('.partido');
ok(page.url().includes('#/partido/'), 'desde el historial se abre el partido');

console.log(errores.length ? '\nERRORES:\n' + errores.join('\n') : '\nTodo bien');
await navegador.close();
s.close();
process.exit(errores.length ? 1 : 0);
