# Roots Tablet

App para anotar partidos de voleibol en la tablet, **sin internet y sin el computador**. Lee el archivo que exporta Roots, guarda todo en la propia tablet y devuelve un archivo de resultados.

## 1. Publicarla (una sola vez)
Necesita un enlace **HTTPS** para poder instalarse. Cualquiera de estas opciones es gratis:
- **Netlify Drop**: entra a app.netlify.com/drop y arrastra esta carpeta. Te da un enlace `https://...netlify.app`.
- **GitHub Pages**: sube la carpeta a un repositorio y activa Pages (rama principal, carpeta raíz).
- **Cloudflare Pages**: crea un proyecto y sube la carpeta (sin comando de build).

## 2. Instalarla en la tablet
1. Abre el enlace en Chrome (con internet, una vez).
2. Menú ⋮ → **Instalar app** (o desde Ajustes → Instalar). Queda con icono propio y abre sin internet.

## 3. Usarla
1. En Roots: Anotación en vivo → **Exportar para tablet**. Pasa el archivo a la tablet.
2. En la app: **Importar archivo**. ¿No alcanzaste a exportar un partido? Toca **Nuevo partido**: eliges el torneo, el rival (un toque si ya jugaron en ese torneo, o lo escribes), si Roots es local o visitante, la fecha y la hora. Necesitas haber importado un archivo de Roots al menos una vez (de ahí salen los torneos y las jugadoras). El partido queda marcado "Creado en la tablet". Importar de nuevo el mismo archivo no duplica ni borra lo anotado.
3. Abre un partido: elige el formato, arma la **Plantilla** (6 en cancha + líbero/es), confirma y anota con el marcador y la pestaña **Acciones**.
4. Todo se guarda solo, jugada por jugada: en la barra del partido se ve **Guardado 10:42**. Si cierras la app o se apaga la tablet a mitad de partido, al volver sigue donde estaba. Hay un segundo seguro (un espejo del partido abierto): si lo último no alcanzó a escribirse, se recupera solo al abrir. Si algo no se puede guardar, sale un aviso rojo con **Exportar borrador**.
   - **Borrador** (menú ⋮ → *Exportar borrador*, o el aviso del inicio cuando hay un set en juego): archivo con TODO el partido, también el set que no se ha cerrado. Para recuperarlo, **Importar archivo** y elegir el borrador. No pisa lo que la tablet tenga más nuevo. No es el archivo para Roots: los resultados se exportan al terminar.
5. En la pestaña **Resumen** hay un **Resumen para compartir** (el mismo de Roots): marcador por sets, mejores jugadoras y puntos clave. Se puede **Compartir…** (WhatsApp y demás), descargar como **PDF** o **imagen**, o ver la vista previa. Usa los sets ya guardados.
6. Si te equivocas: menú ⋮ → **Corregir sets guardados** (cambiar un marcador o reabrir el último set). Al reabrir, el set vuelve con su rotación y su saque exactos.
7. Al terminar: **Resultados** → marca los partidos → Exportar. Después te pregunta si quieres quitarlos de la tablet (solo se borran si dices que sí).

## Pasar archivos sin cables ni correo
En el inicio, **Recibir** (o "Recibir por Drive o QR" si aún no hay partidos) y, al enviar algo (resultados, borrador o copia), una ventana con las opciones:
- **Google Drive**: la tablet baja el archivo de la carpeta `Roots Tablet` de tu Drive (el más nuevo primero) y sube lo que envía a la carpeta `Roots Tablet - Enviados` (la crea la app la primera vez). Necesita internet y la configuración de abajo.
- **Código QR** (sin internet): el archivo se comprime y se muestra como una serie de QR que se repiten en bucle; el otro aparato los escanea con la cámara en cualquier orden y la app avisa cuántos van y cuáles faltan. Al terminar comprueba que llegó completo. Para enviar basta cualquier navegador; para **escanear** hace falta Chrome para Android actualizado (si no, la app lo avisa). Después de mostrar el QR, **Ya lo recibieron** cuenta como enviado (así te deja quitar los partidos de la tablet).
- **Compartir…** (si el aparato lo permite) y **Guardar en la tablet**, como antes.

### Google Drive: configurarlo una sola vez
1. En console.cloud.google.com crea un proyecto y activa la **Google Drive API**.
2. *APIs y servicios → Pantalla de consentimiento*: tipo Externo, y en "Usuarios de prueba" agrega tu cuenta de Google (mientras la app esté en modo prueba solo esas cuentas pueden entrar; Google mostrará "app sin verificar": Continuar).
3. *Credenciales → Crear credenciales → ID de cliente de OAuth*, tipo **Aplicación web**. En "Orígenes autorizados de JavaScript" pon el enlace donde publicas la app (por ejemplo `https://tu-app.netlify.app`).
4. Copia el ID de cliente y pégalo en `js/config.js` (`googleClientId`). Sube el número de `VERSION` en `sw.js` y vuelve a publicar.
5. En tu Drive crea la carpeta `Roots Tablet` y deja ahí el archivo de "Exportar para tablet". Permisos que pide la app: leer Drive y escribir solo lo que ella crea.
Sin el ID de cliente todo lo demás funciona; los botones de Drive solo explican que falta configurarlo.

### Formato de los códigos QR (para Roots)
Cada QR lleva un marco de texto `RT1.<id>.<i>.<n>.<c>.<crc>.<datos>`: `id` (4 letras, cambia en cada envío), `i` (desde 0) y `n` (total), `c` (1 = gzip), `crc` (CRC-32 en hex de los bytes unidos) y `datos` (base64 seguro para URL, 480 caracteres por marco). Quien recibe junta los marcos del mismo `id`, comprueba el `crc`, descomprime y obtiene el JSON. `js/qr/marcos.js` (marcos) y `js/qr/codigoQR.js` (dibujo del QR) no dependen de la pantalla y se pueden copiar a Roots tal cual.

## Copia de seguridad
Ajustes → **Guardar copia** crea un archivo con todo lo de la tablet (partidos, lo anotado, jugadores). Mándalo a tu correo o Drive. En el inicio aparece un aviso cuando hay partidos con cambios sin copia. **Restaurar una copia** reemplaza todo lo que hay en la tablet (antes te guarda una copia de lo actual).

## Actualizar la app
Cambia lo que necesites, sube el número de `VERSION` en `sw.js` y vuelve a publicar. En el inicio de la tablet aparece "Hay una versión nueva" con botón Actualizar.

## Formatos
- Entrada: `aplicacion: "roots-tablet"`, versión 1 (lo genera Roots).
- Salida: `aplicacion: "roots-tablet-resultados"`, versión 1 (`roots-resultados-AAAA-MM-DD.json`). Los partidos creados en la tablet traen `creadoEnTablet: true` y un `idTablet` único; su `id` es solo de la tablet (desde 1.000.000.000), no de Roots: al importar en Roots hay que crear el partido (con `torneoId`, equipos, fecha y hora) usando `idTablet` para no duplicarlo. Importarlo en Roots es el siguiente paso.

## Borrador
Formato: `aplicacion: "roots-tablet-borrador"`, versión 1 (`roots-borrador-AAAA-MM-DD-HHMM.json`): partidos completos (sets + set en juego), sus torneos y jugadores. Solo lo lee la tablet.

## Pruebas
`npm test` (motor, datos, PWA, borrador, Drive y QR). Recorridos en navegador (necesitan Playwright): `node e2e/recorrido.mjs`, `e2e/borrador.mjs` y `e2e/transferir.mjs` (este último lee los QR de la pantalla con OpenCV de Python).
