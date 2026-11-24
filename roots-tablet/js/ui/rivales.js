// Pantallas de rivales: la lista de equipos contra los que ya se jugó y el historial de cada uno (partidos, cómo anota,
// mapa de calor de sus ataques con todos los partidos juntos).
import { app, irA } from '../contexto.js';
import { rivalesConHistorial } from '../historialRival.js';
import { normalizarNombre } from '../nuevoPartido.js';
import { fechaCorta, horaCorta, textoDeSets } from '../resumen.js';
import { h, icono } from './dom.js';
import { bloqueDetalleRival } from './puntoRival.js';

export const rutaDeRival = (clave) => `#/rival/${encodeURIComponent(clave)}`;
const todos = () => rivalesConHistorial([...app.partidos.values()], normalizarNombre);

const textoRecord = (r) => {
  if (r.ganados + r.perdidos + r.empatados === 0) return 'sin sets guardados todavía';
  const partes = [`${r.ganados} ${r.ganados === 1 ? 'ganado' : 'ganados'}`, `${r.perdidos} ${r.perdidos === 1 ? 'perdido' : 'perdidos'}`];
  if (r.empatados) partes.push(`${r.empatados} ${r.empatados === 1 ? 'empatado' : 'empatados'}`);
  return partes.join(' · ');
};

function cabecera(titulo, subtitulo, atras) {
  return h('header', { class: 'inicio-cabeza' }, h('button', { class: 'btn-icono', 'aria-label': 'Volver', onclick: () => irA(atras) }, icono('atras')), h('div', { class: 'inicio-titulo' }, h('h1', {}, titulo), h('p', {}, subtitulo)));
}

export function vistaRivales() {
  const lista = todos();
  const cuerpo = lista.length
    ? h(
        'div',
        { class: 'lista-opciones', 'data-lista-rivales': '' },
        lista.map((r) =>
          h(
            'button',
            { class: 'opcion', 'data-rival': r.clave, onclick: () => irA(rutaDeRival(r.clave)) },
            h('span', { class: 'datos' }, h('strong', {}, r.nombre), h('small', {}, `${r.partidos.length} ${r.partidos.length === 1 ? 'partido' : 'partidos'} · ${textoRecord(r)}`), h('small', {}, r.resumen.conDetalle > 0 ? `${r.resumen.conDetalle} de ${r.resumen.total} puntos del rival con detalle` : 'Sin detalle de cómo anota todavía'))
          )
        )
      )
    : h('div', { class: 'vacio' }, h('h2', {}, 'Todavía no hay rivales'), h('p', { class: 'nota' }, 'Cuando importes o crees un partido, el rival aparecerá aquí con su historial.'));
  return h('div', { class: 'inicio' }, cabecera('Rivales', 'Historial y cómo anota cada equipo', '#/'), h('main', { class: 'inicio-cuerpo' }, cuerpo));
}

export function vistaRival(clave) {
  const r = todos().find((x) => x.clave === clave);
  if (!r) {
    return h('div', { class: 'inicio' }, cabecera('Rival', 'No se encontró', '#/rivales'), h('main', { class: 'inicio-cuerpo' }, h('div', { class: 'vacio' }, h('h2', {}, 'Ese rival ya no está en la tablet'), h('p', { class: 'nota' }, 'Sus partidos se quitaron o se exportaron.'))));
  }
  const partidos = r.partidos.map((p) =>
    h(
      'button',
      { class: 'opcion', 'data-partido': String(p.id), onclick: () => irA(`#/partido/${p.id}`) },
      h('span', { class: 'datos' }, h('strong', {}, `${p.equipoLocal} vs ${p.equipoVisitante}`), h('small', {}, `${fechaCorta(p.fecha)} ${horaCorta(p.hora)} · ${textoDeSets(p.est)}`))
    )
  );
  return h(
    'div',
    { class: 'inicio' },
    cabecera(r.nombre, `${r.partidos.length} ${r.partidos.length === 1 ? 'partido' : 'partidos'} · ${textoRecord(r)}`, '#/rivales'),
    h(
      'main',
      { class: 'inicio-cuerpo', 'data-scroll': 'rival' },
      h('div', { class: 'tarjeta tarjeta-rival', 'data-tarjeta-rival': '' }, h('div', { class: 'titulo-grupo' }, `Cómo anota ${r.nombre} (todos los partidos)`), r.resumen.total > 0 ? bloqueDetalleRival(r.resumen, r.nombre) : h('p', { class: 'nota' }, 'Todavía no hay puntos del rival anotados.')),
      h('div', { class: 'titulo-grupo' }, 'Partidos'),
      h('div', { class: 'lista-opciones' }, partidos)
    )
  );
}
