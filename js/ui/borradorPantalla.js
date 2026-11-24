// Pantallas del borrador: indicador "Guardado", exportar el borrador y volver a meter uno en la tablet.
import { app, cargarDatos } from '../contexto.js';
import { ErrorBorrador, aplicarBorrador, construirBorrador, leerBorrador, nombreArchivoBorrador } from '../borrador.js';
import { confirmar, informar, toast } from './aviso.js';
import { h } from './dom.js';
import { entregarArchivo } from './entregar.js';

const hora = (f) => f.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });

function textoGuardado() {
  if (app.almacen.modo === 'memoria') return { clase: 'error', texto: 'Sin guardar' };
  if (app.guardado.estado === 'error') return { clase: 'error', texto: 'No se pudo guardar' };
  return app.guardado.hora ? { clase: 'ok', texto: `Guardado ${hora(app.guardado.hora)}` } : { clase: 'ok', texto: 'Guardado' };
}

// Pieza para la barra del partido. Se actualiza sola (sin redibujar la pantalla) cada vez que termina de guardarse algo.
export function indicadorGuardado() {
  const { clase, texto } = textoGuardado();
  return h('span', { id: 'indicador-guardado', class: `indicador-guardado ${clase}`, role: 'status' }, texto);
}

export function refrescarIndicadorGuardado() {
  const el = document.getElementById('indicador-guardado');
  if (!el) return;
  const { clase, texto } = textoGuardado();
  el.className = `indicador-guardado ${clase}`;
  el.textContent = texto;
}

export async function exportarBorradorAhora(ids) {
  const registros = ids.map((id) => app.partidos.get(id)).filter(Boolean);
  if (!registros.length) return toast('No hay nada para el borrador.', 'info');
  const borrador = construirBorrador({ registros, torneos: [...app.torneos.values()], jugadores: [...app.jugadores.values()], versionApp: app.version });
  const salio = await entregarArchivo(JSON.stringify(borrador), nombreArchivoBorrador(new Date()), {
    titulo: 'Guardar el borrador',
    textoCompartir: 'Lleva todo lo anotado, también el set que se está jugando. Para seguir en esta u otra tablet, impórtalo con "Importar archivo". Los resultados para Roots se exportan al terminar.',
  });
  if (!salio) return false;
  // Se marca la hora en que se tomó el borrador: lo anotado mientras se compartía queda como pendiente.
  await app.almacen.guardar('meta', { clave: 'ultimoBorrador', fecha: borrador.creadoEn });
  app.ultimoBorrador = borrador.creadoEn;
  toast(`Borrador guardado: ${registros.length} partido${registros.length === 1 ? '' : 's'}.`, 'ok');
  app.renderizar();
  return true;
}

// Devuelve true si el texto era un borrador (y lo atendió), false si es otro tipo de archivo.
export async function importarBorradorSiEs(texto) {
  let datos;
  try {
    datos = JSON.parse(texto.replace(/^﻿/, ''));
  } catch {
    return false;
  }
  if (datos?.aplicacion !== 'roots-tablet-borrador') return false;
  let borrador;
  try {
    borrador = leerBorrador(datos);
  } catch (err) {
    if (err instanceof ErrorBorrador) {
      await informar({ titulo: 'No pude abrir ese borrador', texto: err.message });
      return true;
    }
    throw err;
  }
  const nombres = borrador.partidos.map((p) => `${p.equipoLocal} vs ${p.equipoVisitante}`).join(', ');
  const ok = await confirmar({
    titulo: 'Recuperar el borrador',
    texto: `Trae ${borrador.partidos.length === 1 ? 'el partido' : 'los partidos'} ${nombres}. Si la tablet ya tiene uno de ellos con cambios más nuevos, se deja como está.`,
    si: 'Recuperar',
  });
  if (!ok) return true;
  const { restaurados, conservados } = await aplicarBorrador(app.almacen, borrador);
  await cargarDatos();
  const lineas = [];
  if (restaurados.length) lineas.push(`${restaurados.length} partido${restaurados.length === 1 ? '' : 's'} recuperado${restaurados.length === 1 ? '' : 's'}.`);
  if (conservados.length) lineas.push(`${conservados.length} ya estaba${conservados.length === 1 ? '' : 'n'} con lo mismo o más nuevo: no se tocó.`);
  await informar({ titulo: 'Borrador importado', texto: h('div', { class: 'ventana-texto' }, lineas.map((l) => h('p', {}, l))), boton: 'Ver partidos' });
  app.renderizar();
  return true;
}
