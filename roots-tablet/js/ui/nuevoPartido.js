// "Nuevo partido": para cuando no alcanzaste a exportarlo desde Roots. Todo se elige con toques;
// solo el rival se puede escribir (y si ya jugaste contra él en ese torneo, basta tocar su nombre).
import { app, guardarPartido, irA } from '../contexto.js';
import { ErrorNuevoPartido, MAX_NOMBRE, NOMBRE_EQUIPO_PROPIO, crearPartidoEnTablet, hoyYAhora, rivalExacto, rivalesParecidos, sugerirRivales } from '../nuevoPartido.js';
import { abrirVentana, informar, toast } from './aviso.js';
import { h, rellenar } from './dom.js';

// "Escribiste X, pero ya existe Y": devuelve el nombre elegido, o null si cierra la ventana sin elegir.
function preguntarMismoRival(escrito, parecidos) {
  return new Promise((resolver) => {
    abrirVentana({
      titulo: '¿Es el mismo equipo?',
      contenido: h('p', { class: 'ventana-texto' }, `Escribiste «${escrito}», pero ya hay ${parecidos.length > 1 ? 'equipos parecidos' : 'un equipo parecido'}. Así no se separan los resultados de un mismo rival en dos.`),
      ancho: 'chica',
      acciones: [...parecidos.map((n) => ({ texto: `Sí, es ${n}`, tipo: 'primario', valor: n })), { texto: `No, es otro: ${escrito}`, valor: escrito }],
      alCerrar: (valor) => resolver(valor ?? null),
    });
  });
}

const etiquetaGenero = (t) => (t.genero === 'femenino' ? 'Femenino' : 'Masculino');

export async function abrirNuevoPartido() {
  const torneos = [...app.torneos.values()].sort((a, b) => a.id - b.id);
  if (torneos.length === 0) {
    await informar({ titulo: 'Primero importa un archivo de Roots', texto: 'Para crear un partido la tablet necesita conocer el torneo y las jugadoras. Importa una vez el archivo de Roots (Anotación en vivo > Exportar para tablet) y después podrás crear partidos aquí.', boton: 'Entendido' });
    return;
  }
  const ahora = hoyYAhora();
  const estado = { torneoId: torneos.length === 1 ? torneos[0].id : null, rival: '', rootsDeLocal: true, fecha: ahora.fecha, hora: ahora.hora };

  const zonaTorneo = h('div', { class: 'campo' });
  const zonaRivales = h('div', { class: 'chips' });
  const zonaLado = h('div', { class: 'campo' });
  const entradaRival = h('input', { type: 'text', class: 'entrada', maxlength: String(MAX_NOMBRE), placeholder: 'Escribe el nombre del rival', autocomplete: 'off', 'aria-label': 'Equipo rival' });
  const entradaFecha = h('input', { type: 'date', class: 'entrada', value: estado.fecha, 'aria-label': 'Fecha del partido' });
  const entradaHora = h('input', { type: 'time', class: 'entrada', value: estado.hora, 'aria-label': 'Hora del partido' });
  entradaRival.addEventListener('input', () => { estado.rival = entradaRival.value; pintarRivales(); });
  entradaFecha.addEventListener('change', () => { estado.fecha = entradaFecha.value; });
  entradaHora.addEventListener('change', () => { estado.hora = entradaHora.value; });

  const pintarTorneos = () =>
    rellenar(
      zonaTorneo,
      h('label', { class: 'campo-titulo' }, 'Torneo'),
      h('div', { class: 'chips' }, torneos.map((t) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(estado.torneoId === t.id), onclick: () => { estado.torneoId = t.id; pintarTorneos(); pintarRivales(); } }, `${t.nombre} · ${etiquetaGenero(t)}`)))
    );

  function pintarRivales() {
    const sugeridos = sugerirRivales(estado.rival, [...app.partidos.values()], estado.torneoId);
    const actual = estado.rival.trim().toLowerCase();
    rellenar(zonaRivales, sugeridos.map((n) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(actual === n.toLowerCase()), onclick: () => { estado.rival = n; entradaRival.value = n; pintarRivales(); } }, n)));
  }

  const pintarLado = () =>
    rellenar(
      zonaLado,
      h('label', { class: 'campo-titulo' }, `${NOMBRE_EQUIPO_PROPIO} juega de`),
      h('div', { class: 'segmentos' }, h('button', { type: 'button', 'aria-pressed': String(estado.rootsDeLocal), onclick: () => { estado.rootsDeLocal = true; pintarLado(); } }, 'Local'), h('button', { type: 'button', 'aria-pressed': String(!estado.rootsDeLocal), onclick: () => { estado.rootsDeLocal = false; pintarLado(); } }, 'Visitante'))
    );

  pintarTorneos();
  pintarRivales();
  pintarLado();

  const cuerpo = h(
    'div',
    { class: 'formulario' },
    zonaTorneo,
    h('div', { class: 'campo' }, h('label', { class: 'campo-titulo' }, 'Equipo rival'), zonaRivales, entradaRival),
    zonaLado,
    h('div', { class: 'campo dos' }, h('div', {}, h('label', { class: 'campo-titulo' }, 'Fecha'), entradaFecha), h('div', {}, h('label', { class: 'campo-titulo' }, 'Hora'), entradaHora)),
    h('p', { class: 'nota' }, 'Este partido solo existe en la tablet hasta que exportes los resultados; al importarlos, Roots lo crea.')
  );

  abrirVentana({
    titulo: 'Nuevo partido',
    subtitulo: 'Para cuando no alcanzaste a exportarlo desde Roots',
    contenido: cuerpo,
    ancho: 'media',
    acciones: [
      { texto: 'Cancelar' },
      {
        texto: 'Crear partido',
        tipo: 'primario',
        onclick: async () => {
          try {
            const torneo = app.torneos.get(estado.torneoId);
            let rival = (estado.rival || entradaRival.value).trim();
            const existentes = [...app.partidos.values()];
            const parecidos = rivalExacto(rival, existentes) ? [] : rivalesParecidos(rival, existentes);
            if (parecidos.length) {
              const elegido = await preguntarMismoRival(rival, parecidos);
              if (elegido == null) return false; // cerró sin elegir: sigue en el formulario
              rival = elegido;
            }
            const registro = crearPartidoEnTablet({ torneo, rival, rootsDeLocal: estado.rootsDeLocal, fecha: entradaFecha.value || estado.fecha, hora: entradaHora.value || estado.hora }, existentes);
            await guardarPartido(registro);
            toast('Partido creado.', 'ok');
            irA(`#/partido/${registro.id}`);
          } catch (err) {
            if (!(err instanceof ErrorNuevoPartido)) throw err;
            toast(err.message, 'error');
            return false; // la ventana sigue abierta
          }
        },
      },
    ],
  });
}
