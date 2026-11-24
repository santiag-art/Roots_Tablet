// Service worker de Roots Tablet: guarda la app en el teléfono/tablet para que abra sin internet.
// Al cambiar cualquier archivo de la app, sube VERSION para que los equipos descarguen la versión nueva.
const VERSION = 'roots-tablet-v1.8.0';
const ARCHIVOS = [
  './',
  'css/app.css',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'img/cancha-roots.jpg',
  'img/roots-logo.png',
  'js/borrador.js',
  'js/config.js',
  'js/contexto.js',
  'js/drive.js',
  'js/copia.js',
  'js/estadisticas.js',
  'js/exportar.js',
  'js/importar.js',
  'js/main.js',
  'js/motor.js',
  'js/nuevoPartido.js',
  'js/qr/codigoQR.js',
  'js/qr/marcos.js',
  'js/reglas/anotacion.js',
  'js/reglas/catalogos.js',
  'js/reglas/disponibilidad.js',
  'js/reglas/faltaPosicion.js',
  'js/reglas/fundamentosPosicion.js',
  'js/reglas/liberos.js',
  'js/reglas/posiciones.js',
  'js/reglas/reglasSet.js',
  'js/reglas/reglasSustitucion.js',
  'js/reglas/rotaciones.js',
  'js/reglas/voleibol.js',
  'js/resumen.js',
  'js/resumenCompartir.js',
  'js/store.js',
  'js/ui/acciones.js',
  'js/ui/ajustes.js',
  'js/ui/aviso.js',
  'js/ui/borradorPantalla.js',
  'js/ui/copiaPantalla.js',
  'js/ui/dom.js',
  'js/ui/driveSesion.js',
  'js/ui/escanerQR.js',
  'js/ui/entregar.js',
  'js/ui/exportarPantalla.js',
  'js/ui/inicio.js',
  'js/ui/mostrarQR.js',
  'js/ui/nuevoPartido.js',
  'js/ui/partido.js',
  'js/ui/piezas.js',
  'js/ui/plantilla.js',
  'js/ui/resumenPartido.js',
  'js/ui/tiempoMuerto.js',
  'js/ui/transferir.js',
  'index.html',
  'manifest.webmanifest',
];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((c) => c.startsWith('roots-tablet-') && c !== VERSION).map((c) => caches.delete(c)))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (evento) => {
  if (evento.data === 'actualizar') self.skipWaiting();
});

self.addEventListener('fetch', (evento) => {
  const pedido = evento.request;
  if (pedido.method !== 'GET' || new URL(pedido.url).origin !== self.location.origin) return;
  evento.respondWith(
    caches.match(pedido, { ignoreSearch: true }).then(
      (guardado) =>
        guardado ||
        fetch(pedido).catch(() => (pedido.mode === 'navigate' ? caches.match('index.html') : Response.error()))
    )
  );
});
