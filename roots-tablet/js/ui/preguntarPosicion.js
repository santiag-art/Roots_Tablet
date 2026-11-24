// Pregunta con qué posición juega una jugadora en este partido, igual que en Roots.
// Se usa cada vez que alguien entra a la plantilla o entra por un cambio. La de su ficha sale marcada como sugerida
// (o la que se eligió antes en este partido, si ya había una). Un toque elige y confirma.
import { OPCIONES_POSICION, posicionEstandar, tienePosicionElegida } from '../posicionPartido.js';
import { abrirVentana } from './aviso.js';
import { h, nombreCorto } from './dom.js';
import { circuloJugador } from './piezas.js';

// Devuelve el nombre de la posición elegida, o null si se canceló (en ese caso no se hace nada).
//   texto: explicación opcional que se muestra arriba (por ejemplo, de qué cambio se trata).
export function preguntarPosicion(V, jugadorId, { titulo = null, texto = null } = {}) {
  const { d, est } = V;
  const j = d.jugadoresPorId.get(jugadorId);
  const ficha = posicionEstandar(j?.posicion);
  const previa = tienePosicionElegida(est, jugadorId) ? posicionEstandar(est.posiciones[jugadorId]) : null;
  const sugerida = previa ?? ficha;
  return new Promise((resolver) => {
    abrirVentana({
      titulo: titulo ?? `¿De qué posición juega ${nombreCorto(d.nombre(jugadorId))}?`,
      subtitulo: titulo ? `¿De qué posición juega ${nombreCorto(d.nombre(jugadorId))}?` : 'De ella dependen las jugadas que se le pueden anotar',
      ancho: 'chica',
      alCerrar: () => resolver(null),
      contenido: (cerrar) =>
        h(
          'div',
          { class: 'lista-opciones', 'data-pregunta-posicion': '' },
          texto ? h('p', { class: 'ventana-texto' }, texto) : null,
          OPCIONES_POSICION.map((pos) => {
            const notas = [pos === ficha ? 'Su ficha' : null, previa && pos === previa && pos !== ficha ? 'La que tenía en este partido' : null].filter(Boolean).join(' · ');
            return h(
              'button',
              { class: `opcion ${pos === sugerida ? 'principal' : ''}`, 'data-posicion': pos, onclick: () => { resolver(pos); cerrar(); } },
              h('span', { class: 'datos' }, h('strong', {}, pos), notas ? h('small', {}, notas) : null)
            );
          })
        ),
    });
  });
}

// Círculo + nombre, por si una ventana quiere mostrar de quién se trata.
export function cabezaJugadora(V, jugadorId) {
  return h('div', { class: 'cabeza-jugadora' }, circuloJugador(V, jugadorId, { etiquetaLibero: false }), h('strong', {}, V.d.nombre(jugadorId)));
}
