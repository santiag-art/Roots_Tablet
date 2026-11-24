import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const tipos = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
export function servir(raiz, puerto = 0) {
  const s = createServer(async (req, res) => {
    let ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (ruta.endsWith('/')) ruta += 'index.html';
    try {
      const f = join(raiz, normalize(ruta));
      const datos = await readFile(f);
      res.writeHead(200, { 'content-type': tipos[extname(f)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(datos);
    } catch { res.writeHead(404); res.end('no'); }
  });
  return new Promise((ok) => s.listen(puerto, '127.0.0.1', () => ok({ s, puerto: s.address().port })));
}
