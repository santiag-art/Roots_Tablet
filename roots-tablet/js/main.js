// Arranque de la app: abre el almacenamiento, carga los datos y dibuja la pantalla según la dirección (#/...).
import { app, cargarDatos, reforzarGuardado } from './contexto.js';
import { recuperarDesdeEspejo } from './borrador.js';
import { refrescarIndicadorGuardado } from './ui/borradorPantalla.js';
import { abrirAlmacen, pedirAlmacenamientoPersistente } from './store.js';
import { aplicarTema } from './ui/ajustes.js';
import { toast } from './ui/aviso.js';
import { vaciar, h } from './ui/dom.js';
import { vistaExportar } from './ui/exportarPantalla.js';
import { vistaInicio } from './ui/inicio.js';
import { vistaRival, vistaRivales } from './ui/rivales.js';
import { vistaPartido } from './ui/partido.js';

const raiz = document.getElementById('app');
let bloqueoPantalla = null;
let recargarAlActualizar = false;

function rutaActual() {
  const m = /^#\/partido\/(\d+)$/.exec(location.hash);
  if (m) return { nombre: 'partido', id: Number(m[1]) };
  if (location.hash === '#/exportar') return { nombre: 'exportar' };
  if (location.hash === '#/rivales') return { nombre: 'rivales' };
  const r = /^#\/rival\/(.+)$/.exec(location.hash);
  if (r) {
    try {
      return { nombre: 'rival', id: decodeURIComponent(r[1]) };
    } catch {
      return { nombre: 'rivales' };
    }
  }
  return { nombre: 'inicio' };
}

function guardarScroll() {
  const mapa = new Map();
  raiz.querySelectorAll('[data-scroll]').forEach((el) => mapa.set(el.dataset.scroll, [el.scrollTop, el.scrollLeft]));
  return mapa;
}

function restaurarScroll(mapa) {
  raiz.querySelectorAll('[data-scroll]').forEach((el) => {
    const v = mapa.get(el.dataset.scroll);
    if (v) {
      el.scrollTop = v[0];
      el.scrollLeft = v[1];
    }
  });
}

let rutaAnterior = null;
function renderizar() {
  const ruta = rutaActual();
  const clave = `${ruta.nombre}:${ruta.id ?? ''}`;
  const scroll = clave === rutaAnterior ? guardarScroll() : new Map();
  rutaAnterior = clave;
  let vista;
  try {
    vista = ruta.nombre === 'partido' ? vistaPartido(ruta.id) : ruta.nombre === 'exportar' ? vistaExportar() : ruta.nombre === 'rivales' ? vistaRivales() : ruta.nombre === 'rival' ? vistaRival(ruta.id) : vistaInicio();
  } catch (err) {
    console.error(err);
    vista = h('div', { class: 'vacio' }, h('h2', {}, 'Algo falló al dibujar la pantalla'), h('p', { class: 'nota' }, String(err?.message ?? err)), h('button', { class: 'btn btn-primario', onclick: () => { location.hash = '#/'; location.reload(); } }, 'Volver al inicio'));
  }
  vaciar(raiz).append(vista);
  restaurarScroll(scroll);
  medirCabecera();
  actualizarBloqueoPantalla(ruta);
}

function medirCabecera() {
  const barra = raiz.querySelector('.barra');
  const avisos = raiz.querySelector('.avisos');
  if (!barra) return;
  const alto = barra.offsetHeight + (avisos?.offsetHeight ?? 0);
  document.documentElement.style.setProperty('--alto-cabecera', `${alto}px`);
}

// Pantalla encendida mientras hay un partido abierto. Se pide y se suelta de a una vez: cada punto vuelve a dibujar la
// pantalla, y si se pidiera otro bloqueo mientras el anterior aún llega, quedarían bloqueos sueltos que nadie libera.
let quiereBloqueo = false;
let sincronizandoBloqueo = false;

async function sincronizarBloqueo() {
  if (sincronizandoBloqueo || !navigator.wakeLock) return;
  sincronizandoBloqueo = true;
  try {
    let quiere;
    do {
      quiere = quiereBloqueo;
      if (quiere && !bloqueoPantalla) {
        const bloqueo = await navigator.wakeLock.request('screen');
        bloqueo.addEventListener('release', () => { if (bloqueoPantalla === bloqueo) bloqueoPantalla = null; });
        bloqueoPantalla = bloqueo;
      } else if (!quiere && bloqueoPantalla) {
        const bloqueo = bloqueoPantalla;
        bloqueoPantalla = null;
        await bloqueo.release();
      }
    } while (quiere !== quiereBloqueo); // si cambió la pantalla mientras esperaba, repite
  } catch {
    bloqueoPantalla = null; // sin permiso o sin batería: se reintenta en el próximo dibujo
  } finally {
    sincronizandoBloqueo = false;
  }
}

function actualizarBloqueoPantalla(ruta) {
  quiereBloqueo = ruta.nombre === 'partido';
  return sincronizarBloqueo();
}

function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (recargarAlActualizar) location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const esperar = (w) => {
      if (w && navigator.serviceWorker.controller) {
        app.actualizacion = {
          postMessage: () => {
            recargarAlActualizar = true;
            w.postMessage('actualizar');
          },
        };
        if (rutaActual().nombre === 'inicio') renderizar();
      }
    };
    esperar(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const nuevo = reg.installing;
      nuevo?.addEventListener('statechange', () => nuevo.state === 'installed' && esperar(nuevo));
    });
  }).catch((e) => console.warn('Sin service worker:', e));
}

async function iniciar() {
  try {
    aplicarTema(localStorage.getItem('roots-tema') === 'claro' ? 'claro' : 'oscuro');
  } catch {
    aplicarTema('oscuro');
  }
  app.renderizar = renderizar;
  app.almacen = await abrirAlmacen();
  app.almacen.alFallar = () => {
    app.guardado = { estado: 'error', hora: app.guardado.hora };
    toast('No se pudo guardar lo último. Revisa el espacio de la tablet. Saca un borrador desde el menú del partido.', 'error');
    renderizar();
  };
  app.alCambiarGuardado = refrescarIndicadorGuardado;
  await cargarDatos();
  // Segundo seguro: si lo último que se anotó quedó en el espejo pero no en el almacén, se recupera.
  try {
    const recuperados = await recuperarDesdeEspejo(app.almacen);
    if (recuperados.length) {
      await cargarDatos();
      toast('Recuperé lo último que estabas anotando.', 'ok', 6000);
    }
  } catch (err) {
    console.warn('No se pudo revisar el espejo:', err);
  }
  window.addEventListener('hashchange', renderizar);
  window.addEventListener('resize', medirCabecera);
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); app.instalar = e; });
  window.addEventListener('appinstalled', () => { app.instalar = null; });
  // Al ocultar o cerrar la app, se refuerza el guardado del partido abierto (por si se cierra justo tras una jugada).
  const reforzar = () => {
    const ruta = rutaActual();
    const reg = ruta.nombre === 'partido' ? app.partidos.get(ruta.id) : null;
    if (reg) reforzarGuardado(reg);
  };
  window.addEventListener('pagehide', reforzar);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) reforzar();
    else actualizarBloqueoPantalla(rutaActual());
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(medirCabecera).observe(raiz);
  renderizar();
  registrarServiceWorker();
  pedirAlmacenamientoPersistente().then((p) => { app.persistente = p; });
  window.__roots = app; // para las pruebas de extremo a extremo
}

iniciar().catch((err) => {
  console.error(err);
  raiz.textContent = `No se pudo iniciar la app: ${err?.message ?? err}`;
});
