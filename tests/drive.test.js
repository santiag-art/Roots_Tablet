import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorDrive, crearDrive } from '../js/drive.js';

function falso(respuestas) {
  const llamadas = [];
  const pedir = async (url, op = {}) => {
    llamadas.push({ url: String(url), op });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status === undefined || r.status < 400, status: r.status ?? 200, json: async () => r.json, text: async () => r.texto ?? '' };
  };
  return { llamadas, drive: crearDrive({ fetch: pedir, obtenerToken: async () => 'TOKEN' }) };
}

test('busca la carpeta por nombre (con comillas escapadas) y manda el token', async () => {
  const { drive, llamadas } = falso([{ json: { files: [{ id: 'c1', name: "Roots 'Tablet'" }, { id: 'c2' }] } }]);
  const c = await drive.buscarCarpeta("Roots 'Tablet'");
  assert.equal(c.id, 'c1');
  const url = new URL(llamadas[0].url);
  assert.equal(url.searchParams.get('q'), "name = 'Roots \\'Tablet\\'' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  assert.equal(url.searchParams.get('orderBy'), 'modifiedTime desc');
  assert.equal(llamadas[0].op.headers.Authorization, 'Bearer TOKEN');
});

test('asegurarCarpeta la crea solo si no existe', async () => {
  const a = falso([{ json: { files: [] } }, { json: { id: 'nueva', name: 'X' } }]);
  assert.equal((await a.drive.asegurarCarpeta('X')).id, 'nueva');
  assert.equal(a.llamadas[1].op.method, 'POST');
  assert.deepEqual(JSON.parse(a.llamadas[1].op.body), { name: 'X', mimeType: 'application/vnd.google-apps.folder' });
  const b = falso([{ json: { files: [{ id: 'ya' }] } }]);
  assert.equal((await b.drive.asegurarCarpeta('X')).id, 'ya');
  assert.equal(b.llamadas.length, 1);
});

test('lista solo archivos .json de la carpeta', async () => {
  const { drive, llamadas } = falso([{ json: { files: [{ id: '1', name: 'roots-tablet-2026-11-22.json' }, { id: '2', name: 'foto.png' }, { id: '3', name: 'Otro.JSON' }] } }]);
  const lista = await drive.listarJson('carpeta1');
  assert.deepEqual(lista.map((a) => a.id), ['1', '3']);
  assert.match(new URL(llamadas[0].url).searchParams.get('q'), /^'carpeta1' in parents and trashed = false/);
});

test('descarga el texto de un archivo', async () => {
  const { drive, llamadas } = falso([{ texto: '{"a":1}' }]);
  assert.equal(await drive.descargarTexto('abc/1'), '{"a":1}');
  assert.match(llamadas[0].url, /files\/abc%2F1\?alt=media$/);
});

test('sube un archivo con el nombre, la carpeta y el contenido tal cual (con tildes)', async () => {
  const { drive, llamadas } = falso([{ json: { id: 'nuevo', name: 'r.json' } }]);
  const contenido = '{"equipo":"Águilas ñ"}';
  await drive.subirTexto({ nombre: 'r.json', texto: contenido, carpetaId: 'car' });
  const { url, op } = llamadas[0];
  assert.match(url, /uploadType=multipart/);
  const limite = /boundary=(.+)$/.exec(op.headers['Content-Type'])[1];
  const partes = op.body.split(`--${limite}`).filter((p) => p.trim() && p.trim() !== '--');
  assert.equal(partes.length, 2);
  assert.deepEqual(JSON.parse(partes[0].split('\r\n\r\n')[1]), { name: 'r.json', parents: ['car'], mimeType: 'application/json' });
  assert.equal(partes[1].split('\r\n\r\n')[1].trim(), contenido);
});

test('los errores de Google salen con un mensaje claro y un código', async () => {
  const caso = async (resp) => falso([resp]).drive.buscarCarpeta('X').catch((e) => e);
  const e401 = await caso({ status: 401 });
  assert.ok(e401 instanceof ErrorDrive);
  assert.equal(e401.codigo, 'sesion');
  assert.equal((await caso({ status: 403 })).codigo, 'permiso');
  assert.equal((await caso({ status: 404 })).codigo, 'no-existe');
  assert.match((await caso({ status: 500 })).message, /500/);
  const sinRed = await caso(new TypeError('Failed to fetch'));
  assert.equal(sinRed.codigo, 'sin-internet');
  assert.match(sinRed.message, /internet/);
});
