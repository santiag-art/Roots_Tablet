// Pantalla "Resultados": elegir partidos, generar el archivo para Roots y, solo si lo confirmas, borrarlos de la tablet.
import { app, borrarPartidos, irA } from '../contexto.js';
import { construirResultados, nombreArchivoResultados, resultadoDePartido } from '../exportar.js';
import { estadoDePartido, fechaCorta, horaCorta, hoyISO, ordenarPorFechaHora, textoDeEstado, textoDeSets, tieneSetSinTerminar } from '../resumen.js';
import { abrirVentana, confirmar, informar, toast } from './aviso.js';
import { h, icono } from './dom.js';
import { entregarArchivo } from './entregar.js';

let seleccion = null; // Set de ids; null = aún sin inicializar

function exportables() {
  return [...app.partidos.values()].filter((r) => resultadoDePartido(r) && r.est.sets.length > 0).sort(ordenarPorFechaHora);
}

function iniciarSeleccion(lista) {
  if (seleccion) {
    for (const id of [...seleccion]) if (!lista.some((r) => r.id === id)) seleccion.delete(id);
    return;
  }
  seleccion = new Set(lista.filter((r) => estadoDePartido(r) === 'terminado').map((r) => r.id));
}

async function exportar(lista) {
  const ids = lista.filter((r) => seleccion.has(r.id)).map((r) => r.id);
  if (!ids.length) return toast('Marca al menos un partido.', 'error');
  const elegidos = lista.filter((r) => ids.includes(r.id));

  const avisos = [];
  const sin = elegidos.filter(tieneSetSinTerminar);
  if (sin.length) avisos.push(`${sin.map((r) => `${r.equipoLocal} vs ${r.equipoVisitante}`).join(', ')}: tiene un set sin terminar que NO se exporta (solo van los sets guardados).`);
  const conRoots = elegidos.filter((r) => r.setsEnRoots > 0);
  if (conRoots.length) avisos.push('Roots ya tiene sets de algún partido marcado; al importar te preguntará antes de reemplazarlos.');
  if (avisos.length) {
    const ok = await confirmar({ titulo: 'Antes de exportar', texto: avisos.join(' '), si: 'Exportar igual', no: 'Revisar' });
    if (!ok) return;
  }

  let resultados;
  try {
    resultados = construirResultados({ registros: lista, ids });
  } catch (err) {
    return toast(err.message, 'error');
  }
  const entregado = await entregarArchivo(JSON.stringify(resultados, null, 2), nombreArchivoResultados());
  if (!entregado) return;

  const exportadosIds = resultados.partidos.map((p) => p.id);
  const borrar = await confirmar({
    titulo: '¿Ya tienes el archivo?',
    texto: `Se generó el archivo con ${exportadosIds.length} partido${exportadosIds.length > 1 ? 's' : ''}. Si ya lo guardaste o lo enviaste, puedo quitarlos de la tablet. Si no estás seguro, déjalos: no se pierde nada.`,
    si: 'Sí, quitarlos de la tablet',
    no: 'No, dejarlos',
    peligro: true,
  });
  if (borrar) {
    await borrarPartidos(exportadosIds);
    seleccion = null;
    toast('Partidos quitados de la tablet.', 'ok');
  } else {
    toast('Se dejaron en la tablet.', 'info');
  }
  app.renderizar();
}

export function vistaExportar() {
  const lista = exportables();
  iniciarSeleccion(lista);
  const cuerpo = lista.length
    ? h(
        'div',
        { class: 'lista-opciones' },
        lista.map((r) => {
          const marcado = seleccion.has(r.id);
          const aviso = tieneSetSinTerminar(r) ? 'Set sin terminar: no se exporta' : r.setsEnRoots > 0 ? `Roots ya tiene ${r.setsEnRoots} set${r.setsEnRoots > 1 ? 's' : ''}` : '';
          return h(
            'button',
            {
              class: 'opcion',
              'aria-pressed': String(marcado),
              onclick: () => {
                if (marcado) seleccion.delete(r.id);
                else seleccion.add(r.id);
                app.renderizar();
              },
            },
            h('span', { class: 'check-grande', 'aria-pressed': String(marcado) }, h('span', { class: 'caja' }, marcado ? icono('ok', { tam: 20, grueso: 3 }) : null)),
            h(
              'span',
              { class: 'datos' },
              h('strong', {}, `${r.equipoLocal} vs ${r.equipoVisitante}`, r.fecha === hoyISO() ? ' · HOY' : ''),
              h('small', {}, `${fechaCorta(r.fecha)} ${horaCorta(r.hora)} · ${textoDeEstado(r)} · ${textoDeSets(r.est)}`),
              aviso ? h('small', { style: { color: 'var(--aviso, #f5b942)' } }, aviso) : null
            )
          );
        })
      )
    : h('div', { class: 'vacio' }, h('h2', {}, 'No hay resultados para exportar'), h('p', { class: 'nota' }, 'Cuando guardes al menos un set de un partido, aparecerá aquí.'));

  return h(
    'div',
    { class: 'inicio' },
    h(
      'header',
      { class: 'inicio-cabeza' },
      h('button', { class: 'btn-icono', 'aria-label': 'Volver', onclick: () => irA('#/') }, icono('atras')),
      h('div', { class: 'inicio-titulo' }, h('h1', {}, 'Resultados'), h('p', {}, 'Archivo para llevar a Roots')),
      h(
        'div',
        { class: 'inicio-acciones' },
        h('button', { class: 'btn', onclick: () => { lista.forEach((r) => seleccion.add(r.id)); app.renderizar(); } }, 'Marcar todos'),
        h('button', { class: 'btn btn-primario', disabled: !lista.length || !seleccion.size, onclick: () => exportar(lista) }, icono('bajar'), `Exportar (${seleccion.size})`)
      )
    ),
    h('main', { class: 'inicio-cuerpo' }, h('p', { class: 'nota' }, 'Los partidos terminados vienen marcados. Después de exportar te pregunto si quieres quitarlos de la tablet.'), cuerpo)
  );
}
