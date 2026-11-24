// Ajustes de la app que se cambian antes de publicarla.
//
// googleClientId: ID de cliente OAuth de Google (tipo "Aplicación web"). Sin él, la app funciona igual (archivos y
// códigos QR); solo los botones de Google Drive avisan que falta configurarlo. Pasos en el README, sección "Google Drive".
export const CONFIG = {
  googleClientId: '',
  // Carpeta de tu Drive donde Roots deja el archivo "Exportar para tablet". La tablet la busca por nombre.
  carpetaDeRoots: 'Roots Tablet',
  // Carpeta donde la tablet deja resultados, borradores y copias. La crea la propia app la primera vez.
  carpetaDeEnvios: 'Roots Tablet - Enviados',
};

// Permisos que pide a Google: leer lo que ya hay en Drive (la carpeta de Roots) y escribir solo lo que la app crea.
export const PERMISOS_DRIVE = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/drive.file';
