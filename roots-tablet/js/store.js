// Almacenamiento propio de la tablet.
//
// Todo lo que la app necesita (partidos importados, jugadores, lo anotado) vive en este aparato, en IndexedDB.
// No depende de Roots ni de internet: sobrevive a cerrar la app y a reiniciar la tablet. Se borra solo cuando
// tú exportas los resultados y lo confirmas, o cuando borras un partido a mano.
//
// Si el navegador no deja usar IndexedDB (modo privado, por ejemplo) se trabaja en memoria y la pantalla avisa
// que nada se guardará al cerrar.

const NOMBRE_BD = 'roots-tablet';
const VERSION_BD = 1;

// tabla -> campo que hace de llave
export const TABLAS = {
  torneos: 'id',
  jugadores: 'id',
  lesiones: 'jugadorId', // una fila por jugador: { jugadorId, lesiones: [{ zona, gravedad, disponibilidad }] }
  partidos: 'id',
  importaciones: 'idExportacion',
  meta: 'clave',
};

function promesa(solicitud) {
  return new Promise((resolver, rechazar) => {
    solicitud.onsuccess = () => resolver(solicitud.result);
    solicitud.onerror = () => rechazar(solicitud.error);
  });
}

function terminada(transaccion) {
  return new Promise((resolver, rechazar) => {
    transaccion.oncomplete = () => resolver();
    transaccion.onerror = () => rechazar(transaccion.error);
    transaccion.onabort = () => rechazar(transaccion.error ?? new Error('Transacción cancelada'));
  });
}

// ─────────────── Respaldo en IndexedDB ───────────────

function crearRespaldoIndexedDB(bd) {
  return {
    modo: 'indexeddb',
    async todos(tabla) {
      return promesa(bd.transaction(tabla, 'readonly').objectStore(tabla).getAll());
    },
    async uno(tabla, llave) {
      return (await promesa(bd.transaction(tabla, 'readonly').objectStore(tabla).get(llave))) ?? null;
    },
    async guardar(tabla, filas) {
      const t = bd.transaction(tabla, 'readwrite');
      const almacen = t.objectStore(tabla);
      filas.forEach((fila) => almacen.put(fila));
      await terminada(t);
    },
    async borrar(tabla, llaves) {
      const t = bd.transaction(tabla, 'readwrite');
      const almacen = t.objectStore(tabla);
      llaves.forEach((llave) => almacen.delete(llave));
      await terminada(t);
    },
    async vaciar() {
      const nombres = Object.keys(TABLAS);
      const t = bd.transaction(nombres, 'readwrite');
      nombres.forEach((n) => t.objectStore(n).clear());
      await terminada(t);
    },
  };
}

// ─────────────── Respaldo en memoria (pruebas o navegador sin IndexedDB) ───────────────

export function crearRespaldoMemoria() {
  const tablas = Object.fromEntries(Object.keys(TABLAS).map((n) => [n, new Map()]));
  const copia = (x) => structuredClone(x);
  return {
    modo: 'memoria',
    async todos(tabla) {
      return [...tablas[tabla].values()].map(copia);
    },
    async uno(tabla, llave) {
      const fila = tablas[tabla].get(llave);
      return fila === undefined ? null : copia(fila);
    },
    async guardar(tabla, filas) {
      filas.forEach((fila) => tablas[tabla].set(fila[TABLAS[tabla]], copia(fila)));
    },
    async borrar(tabla, llaves) {
      llaves.forEach((llave) => tablas[tabla].delete(llave));
    },
    async vaciar() {
      Object.values(tablas).forEach((m) => m.clear());
    },
  };
}

async function abrirIndexedDB() {
  if (typeof indexedDB === 'undefined') throw new Error('Este navegador no tiene IndexedDB.');
  const solicitud = indexedDB.open(NOMBRE_BD, VERSION_BD);
  solicitud.onupgradeneeded = () => {
    const bd = solicitud.result;
    Object.entries(TABLAS).forEach(([nombre, llave]) => {
      if (!bd.objectStoreNames.contains(nombre)) bd.createObjectStore(nombre, { keyPath: llave });
    });
  };
  const bd = await promesa(solicitud);
  // Si otra pestaña pide actualizar la base, esta se cierra para no bloquearla.
  bd.onversionchange = () => bd.close();
  return crearRespaldoIndexedDB(bd);
}

// ─────────────── Almacén (lo que usa el resto de la app) ───────────────

// Las escrituras se hacen una tras otra y en orden: así lo último que anotaste es siempre lo último que se guarda.
export function crearAlmacen(respaldo) {
  let cola = Promise.resolve();
  const errores = [];
  const encolar = (tarea) => {
    const hecha = cola.then(tarea);
    cola = hecha.catch((err) => {
      errores.push(err);
      almacen.alFallar?.(err);
    });
    return hecha;
  };
  const almacen = {
    modo: respaldo.modo,
    errores,
    alFallar: null,
    todos: (tabla) => respaldo.todos(tabla),
    uno: (tabla, llave) => respaldo.uno(tabla, llave),
    guardar: (tabla, fila) => encolar(() => respaldo.guardar(tabla, [fila])),
    guardarVarios: (tabla, filas) => (filas.length ? encolar(() => respaldo.guardar(tabla, filas)) : Promise.resolve()),
    borrar: (tabla, llave) => encolar(() => respaldo.borrar(tabla, [llave])),
    borrarVarios: (tabla, llaves) => (llaves.length ? encolar(() => respaldo.borrar(tabla, llaves)) : Promise.resolve()),
    vaciar: () => encolar(() => respaldo.vaciar()),
    // Espera a que todo lo pendiente ya esté escrito (útil en pruebas y antes de cerrar).
    pendientes: () => cola,
  };
  return almacen;
}

export async function abrirAlmacen() {
  try {
    return crearAlmacen(await abrirIndexedDB());
  } catch (err) {
    console.warn('Sin IndexedDB, se trabaja en memoria:', err);
    const almacen = crearAlmacen(crearRespaldoMemoria());
    almacen.motivoMemoria = err?.message ?? String(err);
    return almacen;
  }
}

// Pide al navegador que no borre estos datos si se acaba el espacio. Devuelve si quedó protegido.
export async function pedirAlmacenamientoPersistente() {
  try {
    if (!navigator.storage?.persist) return null;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function usoDeAlmacenamiento() {
  try {
    const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
    return usage == null ? null : { usado: usage, cuota: quota };
  } catch {
    return null;
  }
}
