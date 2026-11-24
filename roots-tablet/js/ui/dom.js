// Utilidades mínimas para armar pantallas sin librerías.

// h('button', { class: 'btn', onclick: fn, 'aria-label': 'Cerrar' }, 'Texto', otroNodo)
export function h(etiqueta, props = {}, ...hijos) {
  const el = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(props ?? {})) {
    if (valor == null || valor === false) continue;
    if (clave === 'class') el.className = valor;
    else if (clave === 'style' && typeof valor === 'object') Object.assign(el.style, valor);
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') el.addEventListener(clave.slice(2), valor);
    else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }
  agregar(el, hijos);
  return el;
}

function agregar(el, hijos) {
  for (const hijo of hijos.flat(Infinity)) {
    if (hijo == null || hijo === false) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
}

export function vaciar(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// ─────────────── Iconos (trazos de Heroicons, el mismo estilo que Roots) ───────────────
const RUTAS = {
  atras: 'M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18',
  deshacer: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
  asa: 'M9 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM15 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM9 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM15 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM9 18.75a.75.75 0 110-1.5.75.75 0 010 1.5zM15 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z',
  menu: 'M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z',
  mas: 'M12 4.5v15m7.5-7.5h-15',
  menos: 'M5 12h14',
  ok: 'M4.5 12.75l6 6 9-13.5',
  cerrar: 'M6 18L18 6M6 6l12 12',
  bajar: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  subir: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5',
  rotar: 'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99',
  candado: 'M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z',
  basura: 'M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0',
  alerta: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  reloj: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  compartir: 'M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z',
  sol: 'M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z',
  luna: 'M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z',
  lista: 'M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5',
  documento: 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
};

export function icono(nombre, { tam = 22, grueso = 2 } = {}) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', tam);
  svg.setAttribute('height', tam);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', grueso);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('icono');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', RUTAS[nombre] ?? '');
  svg.append(path);
  return svg;
}

export function primerNombre(nombre = '') {
  return String(nombre).trim().split(/\s+/)[0] ?? '';
}

// "Valentina Ríos" -> "V. Ríos" (cabe en un círculo)
export function nombreCorto(nombre = '') {
  const partes = String(nombre).trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? '';
  return `${partes[0][0]}. ${partes[1]}`;
}

// Como replaceChildren, pero acepta listas anidadas y valores vacíos (igual que h()).
export function rellenar(el, ...hijos) {
  el.replaceChildren(...hijos.flat(Infinity).filter((x) => x != null && x !== false).map((x) => (x instanceof Node ? x : document.createTextNode(String(x)))));
  return el;
}
