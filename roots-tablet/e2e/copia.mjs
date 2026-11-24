import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { readFile } from 'node:fs/promises';
import { servir } from './servidor.mjs';
const RAIZ = new URL('..', import.meta.url).pathname;
const SHOTS = '/tmp/claude-0/-home-claude/d6ed882e-87da-5ef6-a2d8-ae4657841370/scratchpad/e2e';
const { s, puerto } = await servir(RAIZ);
const nav = await chromium.launch();
const page = await (await nav.newContext({ viewport: { width: 960, height: 600 }, hasTouch: true, acceptDownloads: true })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log(c ? 'ok:' : 'FALLA:', m); if (!c) errs.push(m); };
const vis = '.ventana-fondo:not(.saliendo) ';
await page.goto(`http://127.0.0.1:${puerto}/`);
await page.waitForSelector('.vacio');
const [ch] = await Promise.all([page.waitForEvent('filechooser'), page.click('.vacio .btn-primario')]);
await ch.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.click(vis + '.ventana-pie .btn-primario');
await page.waitForTimeout(300);
ok(!(await page.$('.banda:has-text("sin copia")')), 'sin progreso no hay aviso de copia');
// anotar algo
await page.evaluate(async () => {
  const r = window.__roots.partidos.get(10); r.est.actual.puntosLocal = 3; r.est.actual.puntosVisitante = 2; r.est.actualizadoEn = new Date().toISOString();
  await window.__roots.almacen.guardar('partidos', r);
});
await page.reload(); await page.waitForSelector('.partido-tarjeta');
ok(!!(await page.$('.banda:has-text("sin copia de seguridad")')), 'aparece el aviso de partido sin copia');
await page.screenshot({ path: SHOTS + '/40-aviso-copia.png' });
const [d] = await Promise.all([page.waitForEvent('download'), (async () => { await page.click('.banda >> text=Guardar copia'); await page.click('.ventana-fondo:not(.saliendo) >> text=Guardar en la tablet'); })()]);
const texto = await readFile(await d.path(), 'utf8');
ok(/roots-tablet-copia-/.test(d.suggestedFilename()), 'descarga ' + d.suggestedFilename());
await page.waitForTimeout(500);
ok(!(await page.$('.banda:has-text("sin copia")')), 'el aviso desaparece tras la copia');
// borrar todo desde ajustes
await page.click('[aria-label=Ajustes]');
await page.waitForTimeout(500); await page.screenshot({ path: SHOTS + '/41-ajustes.png' });
await page.click('.ventana-fondo:not(.saliendo) >> text=Borrar todos los datos');
await page.locator(vis + '.ventana-pie .btn-peligro').click(); await page.waitForTimeout(300);
await page.locator(vis + '.ventana-pie .btn-peligro').click(); await page.waitForTimeout(500);
ok((await page.evaluate(() => window.__roots.partidos.size)) === 0, 'tablet vaciada');
// restaurar
await page.click('[aria-label=Ajustes]');
const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('.ventana-fondo:not(.saliendo) >> text=Restaurar una copia')]);
await ch2.setFiles({ name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(texto) });
await page.waitForSelector('.ventana-fondo:not(.saliendo) >> text=Restaurar la copia');
await page.screenshot({ path: SHOTS + '/42-restaurar.png' });
await page.locator(vis + '.ventana-pie .btn-peligro').click();
await page.waitForTimeout(800);
ok((await page.evaluate(() => window.__roots.partidos.size)) === 3, 'copia restaurada: 3 partidos');
ok((await page.evaluate(() => window.__roots.partidos.get(10).est.actual.puntosLocal)) === 3, 'lo anotado volvió');
// archivo equivocado
await page.click('[aria-label=Ajustes]');
const [ch3] = await Promise.all([page.waitForEvent('filechooser'), page.click('.ventana-fondo:not(.saliendo) >> text=Restaurar una copia')]);
await ch3.setFiles(RAIZ + 'tests/fixtures/muestra-roots.json');
await page.waitForSelector('.ventana-fondo:not(.saliendo) >> text=No pude restaurar');
ok(true, 'archivo equivocado se explica');
console.log('ERRORES', errs);
await nav.close(); s.close(); process.exit(errs.length ? 1 : 0);
