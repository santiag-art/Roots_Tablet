// Sesión con Google: carga el inicio de sesión de Google solo cuando hace falta (y solo con internet) y da el token
// que usa js/drive.js. La app sigue funcionando sin nada de esto: es opcional.
import { CONFIG, PERMISOS_DRIVE } from '../config.js';
import { ErrorDrive, crearDrive } from '../drive.js';

let token = null;
let expira = 0;
let cargando = null;

export const driveConfigurado = () => Boolean(CONFIG.googleClientId);

// Conviene llamarlo al abrir la ventana de envío/recepción: así el inicio de sesión ya está cargado cuando se toca el botón
// (los navegadores solo dejan abrir la ventana de Google justo después de un toque).
export function precargarGoogle() {
  if (!driveConfigurado() || globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (cargando) return cargando;
  cargando = new Promise((resolver, rechazar) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolver();
    s.onerror = () => {
      cargando = null;
      s.remove();
      rechazar(new ErrorDrive('No pude cargar el inicio de sesión de Google. Revisa el internet de la tablet.', { codigo: 'sin-internet' }));
    };
    document.head.append(s);
  });
  return cargando;
}

async function pedirToken() {
  if (token && Date.now() < expira - 60000) return token;
  if (navigator.onLine === false) throw new ErrorDrive('La tablet no tiene internet ahora. Google Drive solo funciona con conexión.', { codigo: 'sin-internet' });
  await precargarGoogle();
  return new Promise((resolver, rechazar) => {
    const cliente = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.googleClientId,
      scope: PERMISOS_DRIVE,
      callback: (r) => {
        if (r.error || !r.access_token) {
          rechazar(new ErrorDrive(r.error === 'access_denied' ? 'No aceptaste los permisos de Google.' : 'Google no dio acceso.', { codigo: 'permiso' }));
          return;
        }
        token = r.access_token;
        expira = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        resolver(token);
      },
      error_callback: (e) => rechazar(new ErrorDrive(e?.type === 'popup_closed' ? 'Cerraste la ventana de Google antes de terminar.' : 'No se pudo iniciar sesión en Google.', { codigo: 'sesion' })),
    });
    cliente.requestAccessToken({ prompt: '' });
  });
}

export function olvidarSesion() {
  token = null;
}

export const drive = crearDrive({ obtenerToken: pedirToken });
