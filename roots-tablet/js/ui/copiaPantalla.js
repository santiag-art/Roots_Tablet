// Pantallas de la copia de seguridad: guardar una copia y restaurar una.
import { app, cargarDatos } from '../contexto.js';
import { borrarEspejo } from '../borrador.js';
import { ErrorCopia, construirCopia, contarCopia, leerCopia, marcarCopiaHecha, nombreArchivoCopia, restaurarCopia } from '../copia.js';
import { confirmar, informar, toast } from './aviso.js';
import { h } from './dom.js';
import { entregarArchivo } from './entregar.js';

export async function guardarCopiaAhora() {
  const copia = await construirCopia(app.almacen, { versionApp: app.version });
  const c = contarCopia(copia);
  if (c.partidos === 0 && c.jugadores === 0) return toast('No hay nada que copiar todavía.', 'info');
  const salio = await entregarArchivo(JSON.stringify(copia), nombreArchivoCopia(new Date()), {
    titulo: 'Guardar la copia',
    textoCompartir: 'Mándala a tu correo, Drive o WhatsApp para tenerla fuera de la tablet, o guárdala aquí.',
  });
  if (!salio) return;
  // Se marca la hora en que se tomó la copia, no la de ahora: lo anotado mientras se compartía queda como pendiente.
  await marcarCopiaHecha(app.almacen, new Date(copia.creadaEn));
  app.ultimaCopia = copia.creadaEn;
  toast(`Copia guardada: ${c.partidos} partido${c.partidos === 1 ? '' : 's'}.`, 'ok');
  app.renderizar();
}

export function elegirYRestaurar() {
  const input = h('input', { type: 'file', accept: '.json,application/json,text/plain,application/octet-stream', class: 'solo-lector', 'aria-label': 'Archivo de copia' });
  input.addEventListener('change', async () => {
    const archivo = input.files?.[0];
    input.remove();
    if (!archivo) return;
    try {
      await restaurarDesdeTexto(await archivo.text());
    } catch (err) {
      if (err instanceof ErrorCopia) await informar({ titulo: 'No pude restaurar esa copia', texto: err.message });
      else {
        console.error(err);
        toast('No se pudo restaurar la copia. No se cambió nada.', 'error');
      }
    }
  });
  document.body.append(input);
  input.click();
}

export async function restaurarDesdeTexto(texto) {
  const copia = leerCopia(texto);
  const c = contarCopia(copia);
  const fecha = new Date(copia.creadaEn).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
  const hayActual = app.partidos.size > 0;
  const ok = await confirmar({
    titulo: 'Restaurar la copia',
    texto: `Copia del ${fecha}: ${c.partidos} partido${c.partidos === 1 ? '' : 's'} (${c.partidosConSets} con sets), ${c.jugadores} jugadores. Se reemplaza TODO lo que hay ahora en la tablet${hayActual ? `: ${app.partidos.size} partido${app.partidos.size === 1 ? '' : 's'}. Antes te guardo una copia de lo actual` : ''}.`,
    si: 'Restaurar',
    peligro: true,
  });
  if (!ok) return false;
  if (hayActual) {
    const actual = await construirCopia(app.almacen, { versionApp: app.version });
    const salio = await entregarArchivo(JSON.stringify(actual), nombreArchivoCopia(new Date(), 'roots-tablet-copia-antes-de-restaurar'), {
      titulo: 'Copia de lo actual',
      textoCompartir: 'Guarda esta copia antes de restaurar, por si acaso.',
    });
    if (!salio) return false; // canceló: no se toca nada
  }
  borrarEspejo(); // la copia reemplaza todo: un espejo viejo no debe resucitar lo anterior
  await restaurarCopia(app.almacen, copia);
  await cargarDatos();
  location.hash = '#/';
  app.renderizar();
  toast('Copia restaurada.', 'ok');
  return true;
}
