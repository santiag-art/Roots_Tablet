// Pantalla de inicio: lista de partidos importados, importar archivo y acceso a resultados.
import { app, borrarPartidos, cargarDatos, guardarPartido, irA } from '../contexto.js';
import { aplicarImportacion, ErrorImportacion, leerArchivoRoots } from '../importar.js';
import { comparacionConRoots, estadoDePartido, fechaCorta, horaCorta, hoyISO, marcadorDeSets, ordenarPorFechaHora, textoDeEstado, textoDeSets } from '../resumen.js';
import { abrirVentana, confirmar, informar, toast } from './aviso.js';
import { h, icono } from './dom.js';
import { abrirAjustes } from './ajustes.js';
import { partidosSinBorrador } from '../borrador.js';
import { partidosSinCopia } from '../copia.js';
import { exportarBorradorAhora, importarBorradorSiEs } from './borradorPantalla.js';
import { guardarCopiaAhora } from './copiaPantalla.js';
import { abrirNuevoPartido } from './nuevoPartido.js';
import { bloqueComparacion } from './piezas.js';
import { abrirRecibir } from './transferir.js';

export async function importarTexto(texto, nombreArchivo) {
  if (await importarBorradorSiEs(texto)) return true;
  let datos;
  try {
    datos = leerArchivoRoots(texto);
  } catch (err) {
    if (err instanceof ErrorImportacion) {
      await informar({ titulo: 'No pude importar ese archivo', texto: err.message });
      return false;
    }
    throw err;
  }
  const resumen = await aplicarImportacion(app.almacen, datos, { nombreArchivo });
  await cargarDatos();
  const lineas = [];
  if (resumen.yaImportado) lineas.push('Ya habías importado este archivo: no se duplicó nada y lo que anotaste se conservó.');
  if (resumen.nuevos) lineas.push(`${resumen.nuevos} partido${resumen.nuevos > 1 ? 's' : ''} nuevo${resumen.nuevos > 1 ? 's' : ''}.`);
  if (resumen.actualizados) lineas.push(`${resumen.actualizados} ya estaba${resumen.actualizados > 1 ? 'n' : ''} y se actualizó (aún sin anotar).`);
  if (resumen.conservados) lineas.push(`${resumen.conservados} ya tenía${resumen.conservados > 1 ? 'n' : ''} lo anotado: se conservó tal cual.`);
  lineas.push(`${resumen.jugadores} jugadores de ${resumen.torneos} torneo${resumen.torneos > 1 ? 's' : ''}.`);
  if (resumen.partidosConSetsEnRoots) lineas.push('Ojo: Roots ya tiene sets guardados de algún partido. Lo verás marcado; al importar los resultados en Roots te preguntará antes de reemplazarlos.');
  await informar({ titulo: 'Archivo importado', texto: h('div', { class: 'ventana-texto' }, lineas.map((l) => h('p', { style: { marginBottom: '8px' } }, l))), boton: 'Ver partidos' });
  app.renderizar();
  return true;
}

const recibir = () => abrirRecibir({ alRecibirTexto: importarTexto, alElegirArchivo: elegirArchivo });

function elegirArchivo() {
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain,application/octet-stream', class: 'solo-lector', 'aria-label': 'Archivo de Roots', id: 'entrada-archivo' });
  input.addEventListener('change', async () => {
    const archivo = input.files?.[0];
    input.remove();
    if (!archivo) return;
    try {
      await importarTexto(await archivo.text(), archivo.name);
    } catch (err) {
      console.error(err);
      toast('No se pudo leer el archivo. Inténtalo de nuevo.', 'error');
    }
  });
  document.body.append(input);
  input.click();
}

async function abrirPartido(registro) {
  if (estadoDePartido(registro) === 'pendiente' && registro.setsEnRoots > 0 && !registro.avisoRootsVisto) {
    const sigue = await confirmar({
      titulo: 'Roots ya tiene sets de este partido',
      texto: h(
        'div',
        { class: 'ventana-texto' },
        h('p', { style: { marginBottom: '10px' } }, 'Puedes anotarlo igual: al importar los resultados en Roots te preguntará antes de reemplazar lo que ya tiene.'),
        bloqueComparacion(registro)
      ),
      si: 'Abrir el partido',
      no: 'Volver',
    });
    if (!sigue) return;
    registro.avisoRootsVisto = true;
    guardarPartido(registro);
  }
  irA(`#/partido/${registro.id}`);
}

async function borrarUno(registro) {
  const ok = await confirmar({
    titulo: 'Borrar de la tablet',
    texto: registro.creadoEnTablet
      ? `Se borra ${registro.equipoLocal} vs ${registro.equipoVisitante} de esta tablet. Este partido solo existe aquí: si no lo exportaste, se pierde con todo lo que anotaste.`
      : `Se borra ${registro.equipoLocal} vs ${registro.equipoVisitante} de esta tablet${estadoDePartido(registro) !== 'pendiente' ? ', con todo lo que anotaste. Si no lo exportaste, se pierde' : ''}. En Roots no cambia nada.`,
    si: 'Borrar',
    peligro: true,
  });
  if (!ok) return;
  await borrarPartidos([registro.id]);
  toast('Partido borrado de la tablet.', 'ok');
  app.renderizar();
}

function tarjeta(r) {
  const estado = estadoDePartido(r);
  const sets = textoDeSets(r.est);
  const { local, visitante } = marcadorDeSets(r.est);
  const cRoots = comparacionConRoots(r);
  return h(
    'div',
    { class: 'partido-tarjeta-envoltura', style: { position: 'relative' } },
    h(
      'button',
      { class: `partido-tarjeta ${estado === 'en_juego' ? 'en-juego' : estado === 'terminado' ? 'terminado' : ''}`, onclick: () => abrirPartido(r), 'aria-label': `${r.equipoLocal} contra ${r.equipoVisitante}` },
      h('div', { class: 'cuando' }, icono('reloj', { tam: 16 }), `${fechaCorta(r.fecha)} ${horaCorta(r.hora)}`.trim(), r.fecha === hoyISO() ? h('span', { class: 'etiqueta etiqueta-cancha' }, 'HOY') : null),
      h('div', { class: 'equipos' }, r.equipoLocal, h('span', { class: 'vs' }, 'vs'), r.equipoVisitante),
      h(
        'div',
        { class: 'estado' },
        h('span', { class: `etiqueta ${estado === 'en_juego' ? 'etiqueta-cancha' : estado === 'terminado' ? 'etiqueta-ok' : ''}` }, textoDeEstado(r)),
        r.creadoEnTablet ? h('span', { class: 'etiqueta' }, 'Creado en la tablet') : null,
        r.setsEnRoots > 0 ? h('span', { class: 'etiqueta etiqueta-aviso' }, `Roots ya tiene ${r.setsEnRoots} set${r.setsEnRoots > 1 ? 's' : ''}`) : null
      ),
      sets ? h('div', { class: 'detalle-sets' }, `Tablet: ${local}-${visitante} · ${sets}`) : null,
      cRoots?.detalle ? h('div', { class: 'detalle-sets detalle-roots' }, `Roots: ${cRoots.roots.local}-${cRoots.roots.visitante} · ${cRoots.roots.texto}`) : null
    ),
    h('button', { class: 'partido-borrar', 'aria-label': 'Borrar este partido de la tablet', onclick: () => borrarUno(r) }, icono('basura'))
  );
}

export function vistaInicio() {
  const partidos = [...app.partidos.values()];
  const porTorneo = new Map();
  partidos.forEach((p) => porTorneo.set(p.torneoId, [...(porTorneo.get(p.torneoId) ?? []), p]));

  const bandas = [];
  if (app.actualizacion) {
    bandas.push(h('div', { class: 'banda banda-ok' }, h('p', {}, 'Hay una versión nueva de la app.'), h('button', { class: 'btn btn-primario', onclick: () => app.actualizacion.postMessage('actualizar') }, 'Actualizar')));
  }
  const sinCopia = partidosSinCopia(partidos, app.ultimaCopia);
  if (sinCopia.length > 0) {
    bandas.push(h('div', { class: 'banda' }, h('p', {}, `${sinCopia.length} partido${sinCopia.length === 1 ? '' : 's'} con cambios sin copia de seguridad.`), h('button', { class: 'btn btn-primario', onclick: guardarCopiaAhora }, 'Guardar copia')));
  }
  const sinBorrador = partidosSinBorrador(partidos, app.ultimoBorrador);
  if (sinBorrador.length > 0) {
    bandas.push(h('div', { class: 'banda banda-aviso' }, h('p', {}, `${sinBorrador.length} partido${sinBorrador.length === 1 ? '' : 's'} con un set en juego: ese set todavía no sale en los resultados. Puedes sacar un borrador con todo.`), h('button', { class: 'btn btn-primario', onclick: () => exportarBorradorAhora(sinBorrador.map((p) => p.id)) }, 'Exportar borrador')));
  }
  if (app.almacen.modo === 'memoria') {
    bandas.push(h('div', { class: 'banda banda-error' }, h('p', {}, 'Este navegador no deja guardar datos: lo que anotes se perderá al cerrar la app. Ábrela desde el icono instalado o en Chrome normal (no privado).')));
  }

  const cuerpo = partidos.length
    ? [...porTorneo.entries()]
        .sort(([a], [b]) => a - b)
        .map(([idTorneo, lista]) => {
          const t = app.torneos.get(idTorneo);
          return h(
            'section',
            { class: 'grupo-torneo' },
            h('header', {}, h('h2', {}, t?.nombre ?? 'Torneo'), h('span', { class: 'etiqueta' }, t?.genero === 'femenino' ? 'Femenino' : 'Masculino'), t?.categoria ? h('span', { class: 'etiqueta' }, t.categoria) : null),
            h('div', { class: 'partidos-lista' }, lista.sort(ordenarPorFechaHora).map(tarjeta))
          );
        })
    : h(
        'div',
        { class: 'vacio' },
        h('img', { src: 'img/roots-logo.png', alt: 'Roots' }),
        h('h2', {}, 'Aún no hay partidos'),
        h('p', { class: 'nota' }, 'Esta app no necesita internet ni el computador para anotar.'),
        h('ol', {}, h('li', {}, 'En Roots entra a Anotación en vivo > Exportar para tablet.'), h('li', {}, 'Pasa el archivo a la tablet (WhatsApp, Drive o cable).'), h('li', {}, 'Toca "Importar archivo" y elígelo.')),
        h('button', { class: 'btn btn-primario btn-grande', onclick: elegirArchivo }, icono('subir'), 'Importar archivo de Roots'),
        h('button', { class: 'btn btn-grande', onclick: recibir }, icono('documento'), 'Recibir por Drive o QR')
      );

  return h(
    'div',
    { class: 'inicio' },
    h(
      'header',
      { class: 'inicio-cabeza' },
      h('img', { class: 'logo', src: 'img/roots-logo.png', alt: '' }),
      h('div', { class: 'inicio-titulo' }, h('h1', {}, 'Roots'), h('p', {}, 'Anotación en la tablet')),
      h(
        'div',
        { class: 'inicio-acciones' },
        h('button', { class: 'btn btn-primario', onclick: elegirArchivo }, icono('subir'), 'Importar archivo'),
        h('button', { class: 'btn', onclick: recibir }, icono('documento'), 'Recibir'),
        h('button', { class: 'btn', onclick: abrirNuevoPartido }, icono('mas'), 'Nuevo partido'),
        h('button', { class: 'btn', 'data-ir-rivales': '', onclick: () => irA('#/rivales') }, icono('lista'), 'Rivales'),
        h('button', { class: 'btn', onclick: () => irA('#/exportar') }, icono('bajar'), 'Resultados'),
        h('button', { class: 'btn-icono', 'aria-label': 'Ajustes', onclick: abrirAjustes }, icono('menu'))
      )
    ),
    h('main', { class: 'inicio-cuerpo' }, bandas, cuerpo),
    h('p', { class: 'pie-version' }, `Roots Tablet v${app.version ?? ''}`)
  );
}
