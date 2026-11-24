// Ajustes: tema, instalación, almacenamiento, actualización y borrado total.
import { app, cargarDatos } from '../contexto.js';
import { borrarEspejo } from '../borrador.js';
import { pedirAlmacenamientoPersistente, usoDeAlmacenamiento } from '../store.js';
import { abrirVentana, confirmar, toast } from './aviso.js';
import { h, icono } from './dom.js';
import { elegirYRestaurar, guardarCopiaAhora } from './copiaPantalla.js';

export function temaActual() {
  return document.documentElement.dataset.tema === 'claro' ? 'claro' : 'oscuro';
}

export function aplicarTema(tema) {
  if (tema === 'claro') document.documentElement.dataset.tema = 'claro';
  else delete document.documentElement.dataset.tema;
  try {
    localStorage.setItem('roots-tema', tema);
  } catch {
    /* sin almacenamiento local */
  }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', tema === 'claro' ? '#f4f6fb' : '#0b1220');
}

const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

export async function abrirAjustes() {
  const uso = await usoDeAlmacenamiento();
  const instalada = matchMedia('(display-mode: standalone)').matches;
  const v = abrirVentana({
    titulo: 'Ajustes',
    ancho: 'media',
    contenido: (cerrar) =>
      h(
        'div',
        { class: 'lista-opciones' },
        h(
          'div',
          { class: 'titulo-grupo' },
          'Apariencia'
        ),
        h(
          'div',
          { class: 'segmentos' },
          ['oscuro', 'claro'].map((t) =>
            h('button', { 'aria-pressed': String(temaActual() === t), onclick: () => { aplicarTema(t); cerrar(); app.renderizar(); } }, icono(t === 'claro' ? 'sol' : 'luna', { tam: 18 }), t === 'claro' ? ' Claro' : ' Oscuro')
          )
        ),
        h('div', { class: 'titulo-grupo' }, 'Copia de seguridad'),
        h('p', { class: 'nota' }, app.ultimaCopia ? `Última copia: ${new Date(app.ultimaCopia).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Todavía no has guardado ninguna copia.'),
        h('button', { class: 'btn btn-primario btn-ancho', onclick: () => { cerrar(); guardarCopiaAhora(); } }, icono('bajar', { tam: 18 }), ' Guardar copia'),
        h('button', { class: 'btn btn-ancho', onclick: () => { cerrar(); elegirYRestaurar(); } }, icono('subir', { tam: 18 }), ' Restaurar una copia'),
        h('div', { class: 'titulo-grupo' }, 'Instalación'),
        instalada
          ? h('p', { class: 'nota' }, 'La app ya está instalada en esta tablet.')
          : app.instalar
            ? h('button', { class: 'btn btn-primario btn-ancho', onclick: async () => { app.instalar.prompt(); await app.instalar.userChoice; app.instalar = null; cerrar(); } }, 'Instalar en la tablet')
            : h('p', { class: 'nota' }, 'Para instalarla: en Chrome toca ⋮ y luego "Instalar app" o "Añadir a pantalla de inicio".'),
        h('div', { class: 'titulo-grupo' }, 'Almacenamiento'),
        h('p', { class: 'nota' }, app.almacen.modo === 'memoria' ? 'Sin almacenamiento: los datos se pierden al cerrar.' : `Los datos están guardados solo en esta tablet.${uso ? ` Usa ${mb(uso.usado)}.` : ''}`),
        app.persistente === false
          ? h('button', { class: 'btn btn-ancho', onclick: async () => { app.persistente = await pedirAlmacenamientoPersistente(); toast(app.persistente ? 'Datos protegidos.' : 'El navegador no lo concedió. Instalar la app ayuda.', app.persistente ? 'ok' : 'info'); cerrar(); } }, 'Proteger los datos')
          : h('p', { class: 'nota' }, app.persistente ? 'El navegador prometió no borrarlos.' : ''),
        h('div', { class: 'titulo-grupo' }, 'Versión'),
        h('p', { class: 'nota' }, `Roots Tablet v${app.version}`),
        h('button', { class: 'btn btn-peligro btn-ancho', onclick: async () => {
          const ok = await confirmar({ titulo: 'Borrar todo', texto: 'Se borran TODOS los partidos, jugadores y lo anotado de esta tablet. Si no exportaste, se pierde.', si: 'Continuar', peligro: true });
          if (!ok) return;
          const ok2 = await confirmar({ titulo: '¿Seguro del todo?', texto: 'Esta acción no se puede deshacer.', si: 'Sí, borrar todo', peligro: true });
          if (!ok2) return;
          borrarEspejo();
          await app.almacen.vaciar();
          await cargarDatos();
          cerrar();
          location.hash = '#/';
          app.renderizar();
          toast('Tablet vaciada.', 'ok');
        } }, icono('basura', { tam: 18 }), ' Borrar todos los datos')
      ),
    acciones: [{ texto: 'Cerrar', tipo: 'primario' }],
  });
  return v;
}
