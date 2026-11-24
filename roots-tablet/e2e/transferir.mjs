// Pasar archivos: Google Drive (con Google simulado) y códigos QR (los QR se leen con OpenCV, un lector independiente).
import { createRequire } from 'node:module';
const { chromium } = createRequire('/home/claude/.npm-global/lib/node_modules/')('playwright');
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { servir } from './servidor.mjs';
import { ReceptorMarcos } from '../js/qr/marcos.js';
const RAIZ = new URL('..', import.meta.url).pathname;
const MUESTRA = await readFile(RAIZ + 'tests/fixtures/muestra-roots.json', 'utf8');
const { s, puerto } = await servir(RAIZ);
const nav = await chromium.launch();
const ctx = await nav.newContext({ viewport: { width: 960, height: 700 }, hasTouch: true, acceptDownloads: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ok = (c, m) => { console.log(c ? 'ok:' : 'FALLA:', m); if (!c) errs.push(m); };
const vis = '.ventana-fondo:not(.saliendo) ';

// ── Google simulado ──
const subidas = [];
const llamadasDrive = [];
await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: (readFileSyncCfg()) }));
function readFileSyncCfg() {
  return `export const CONFIG = { googleClientId: 'cliente-de-prueba', carpetaDeRoots: 'Roots Tablet', carpetaDeEnvios: 'Roots Tablet - Enviados' };\nexport const PERMISOS_DRIVE = 'x';`;
}
await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ contentType: 'text/javascript', body: `window.google={accounts:{oauth2:{initTokenClient:(c)=>({requestAccessToken:()=>setTimeout(()=>c.callback({access_token:'T',expires_in:3600}),10)})}}};` }));
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
await ctx.route('https://www.googleapis.com/**', async (r) => {
  const req = r.request();
  if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors });
  const url = new URL(req.url());
  llamadasDrive.push(`${req.method()} ${url.pathname}`);
  const json = (o) => r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(o) });
  if (url.pathname.startsWith('/upload/')) { subidas.push(req.postData()); return json({ id: 'nuevo', name: 'x.json' }); }
  if (req.method() === 'POST') return json({ id: 'F2', name: 'Roots Tablet - Enviados' });
  if (url.searchParams.get('alt') === 'media') return r.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json' }, body: MUESTRA });
  const q = url.searchParams.get('q') ?? '';
  if (q.includes("name = 'Roots Tablet - Enviados'")) return json({ files: [] });
  if (q.includes("name = 'Roots Tablet'")) return json({ files: [{ id: 'F1', name: 'Roots Tablet' }] });
  if (q.includes("'F1' in parents")) return json({ files: [{ id: 'A1', name: 'roots-tablet-2026-11-22.json', modifiedTime: '2026-11-22T08:00:00Z', size: '5000' }, { id: 'A2', name: 'foto.png', modifiedTime: '2026-11-22T08:00:00Z' }] });
  return json({ files: [] });
});

await page.goto(`http://127.0.0.1:${puerto}/`);
await page.waitForSelector('.vacio');

// ── Recibir de Drive ──
await page.click('.vacio .btn:has-text("Recibir por Drive o QR")');
await page.waitForSelector(vis + '>> text=Recibir de Roots');
await page.click(vis + '>> text=Desde Google Drive');
await page.waitForSelector(vis + '>> text=Archivos en Drive');
const nombres = await page.$$eval(vis + '.opcion strong', (e) => e.map((x) => x.textContent));
ok(nombres.length === 1 && nombres[0] === 'roots-tablet-2026-11-22.json', 'lista solo los .json de la carpeta: ' + nombres);
await page.click(vis + '>> text=roots-tablet-2026-11-22.json');
await page.waitForSelector(vis + '>> text=Archivo importado');
await page.locator(vis + '.ventana-pie .btn-primario').click();
await page.waitForSelector('.partido-tarjeta');
ok((await page.evaluate(() => window.__roots.partidos.size)) === 3, 'el archivo de Drive se importó: 3 partidos');

// ── Enviar a Drive ──
await page.click('[aria-label=Ajustes]');
await page.click(vis + '>> text=Guardar copia');
await page.waitForSelector(vis + '>> text=Subir a Google Drive');
const opciones = await page.$$eval(vis + '.opcion strong', (e) => e.map((x) => x.textContent));
ok(['Subir a Google Drive', 'Mostrar código QR', 'Guardar en la tablet'].every((t) => opciones.includes(t)), 'opciones de envío: ' + opciones);
await page.click(vis + '>> text=Subir a Google Drive');
await page.waitForFunction(() => window.__roots.ultimaCopia, null, { timeout: 8000 });
ok(subidas.length === 1 && /roots-tablet-copia/.test(subidas[0]) && subidas[0].includes('"aplicacion":"roots-tablet-copia"'), 'la copia se subió a Drive con su contenido');
ok(llamadasDrive.some((l) => l.startsWith('POST /drive/v3/files')), 'creó la carpeta de envíos');

// ── Enviar por QR y leer los códigos con OpenCV ──
await page.waitForTimeout(500);
await page.click('[aria-label=Ajustes]');
await page.click(vis + '>> text=Guardar copia');
await page.click(vis + '>> text=Mostrar código QR');
await page.waitForSelector('.qr-lienzo');
const carpeta = await mkdtemp(join(tmpdir(), 'qr-'));
const vistos = new Map();
let total = 0;
for (let k = 0; k < 400 && (total === 0 || vistos.size < total); k++) {
  const [texto, url] = await page.evaluate(() => [document.querySelector('.qr-contador')?.textContent ?? '', document.querySelector('.qr-lienzo').toDataURL('image/png')]);
  const m = /Código (\d+) de (\d+)/.exec(texto);
  if (m) { total = Number(m[2]); if (!vistos.has(Number(m[1]))) vistos.set(Number(m[1]), url); }
  await page.waitForTimeout(60);
}
ok(total > 0 && vistos.size === total, `se vieron los ${total} códigos`);
const archivos = [];
for (const [i, url] of vistos) { const f = join(carpeta, `q${i}.png`); await writeFile(f, Buffer.from(url.split(',')[1], 'base64')); archivos.push(f); }
await writeFile(join(carpeta, 'leer.py'), `
import cv2, json, sys
det=cv2.QRCodeDetector(); aru=cv2.QRCodeDetectorAruco(); we=cv2.wechat_qrcode_WeChatQRCode()
out=[]
for f in sys.argv[1:]:
    img=cv2.imread(f)
    t,_,_=det.detectAndDecode(img)
    if not t:
        t,_,_=aru.detectAndDecode(img)
    if not t:
        r,_=we.detectAndDecode(img); t=r[0] if r else ''
    out.append(t)
print(json.dumps(out))
`);
const leidos = JSON.parse(execFileSync('python3', [join(carpeta, 'leer.py'), ...archivos]).toString());
ok(leidos.every(Boolean), `OpenCV leyó los ${leidos.length} códigos de la pantalla`);
const rec = new ReceptorMarcos();
leidos.reverse().forEach((t) => rec.aceptar(t)); // en otro orden, como llegarían escaneados
const texto = rec.completo ? await rec.texto() : '';
ok(texto.includes('"aplicacion":"roots-tablet-copia"') && JSON.parse(texto).tablas.partidos.length === 3, 'el archivo armado desde los QR es la copia completa');
await page.click(vis + '>> text=Ya lo recibieron');
await page.waitForFunction(() => !document.querySelector('.qr-lienzo'));
await page.waitForTimeout(300);
ok(true, 'confirmar "Ya lo recibieron" cierra la pantalla del QR');

// ── Escáner sin lector de QR: mensaje claro ──
await page.click('.btn:has-text("Recibir")');
await page.click(vis + '>> text=Escanear código QR');
await page.waitForSelector(vis + '>> text=no puede leer códigos QR');
ok(true, 'sin lector de QR, explica qué hacer');

// ── Escáner con cámara simulada: recibe un archivo de Roots por QR (desordenado, con repetidos y un QR ajeno) ──
import { crearMarcos } from '../js/qr/marcos.js';
const marcos = await crearMarcos(MUESTRA);
const nav2 = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx2 = await nav2.newContext({ viewport: { width: 960, height: 700 }, serviceWorkers: 'block', permissions: ['camera'] });
const page2 = await ctx2.newPage();
page2.on('pageerror', (e) => errs.push('p2: ' + e.message));
const cola = ['https://ejemplo.com/otro-qr', ...[...marcos].reverse(), marcos[0]];
await page2.addInitScript((c) => {
  window.__cola = c;
  window.BarcodeDetector = class { static async getSupportedFormats() { return ['qr_code']; } async detect() { const v = window.__cola.shift(); return v ? [{ rawValue: v }] : []; } };
}, cola);
await page2.goto(`http://127.0.0.1:${puerto}/`);
await page2.waitForSelector('.vacio');
await page2.click('.vacio .btn:has-text("Recibir por Drive o QR")');
await page2.click(vis + '>> text=Escanear código QR');
await page2.waitForSelector(vis + '>> text=Archivo importado', { timeout: 15000 });
await page2.locator(vis + '.ventana-pie .btn-primario').click();
await page2.waitForSelector('.partido-tarjeta');
ok((await page2.evaluate(() => window.__roots.partidos.size)) === 3, 'escaneando los QR de Roots se importaron los 3 partidos');
await nav2.close();
console.log('ERRORES', errs);
await nav.close(); s.close(); process.exit(errs.length ? 1 : 0);
