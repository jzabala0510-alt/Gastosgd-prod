const fs = require('fs');
const path = require('path');

// Segunda mitad del actualizador (la primera es updater.service.js::prepararActualizacion).
// Los archivos nuevos ya están completos y verificados en .actualizacion/nuevos/, y
// pendiente.json lista cuáles son; aquí solo se mueven a su lugar con renombres.
//
// Por qué así: nodemon (producción corre con npm run dev) mata el backend con
// taskkill /F apenas cambia un archivo de server/, y la copia vieja corría dentro del
// propio backend: el archivo que se estaba escribiendo quedaba vacío o en ceros y los
// siguientes ni se copiaban (marca.js, updater.service.js, usuarios.service.js).
// Un renombre deja el archivo viejo o el nuevo, nunca uno a medias; y si matan el
// proceso entre un renombre y otro, index.js llama a esto al arrancar, antes de cargar
// cualquier otro módulo, y termina lo que faltó.

const dirProyecto = () => process.env.UPDATE_TARGET_DIR || path.resolve(__dirname, '..', '..', '..');
const dirActualizacion = () => path.join(dirProyecto(), '.actualizacion');
const rutaPendiente = () => path.join(dirActualizacion(), 'pendiente.json');
const rutaUltima = () => path.join(dirActualizacion(), 'ultima.json');

const esperar = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// En Windows un antivirus o un editor pueden tener el archivo abierto un instante.
function renombrar(de, a) {
  for (let intento = 1; ; intento++) {
    try { return fs.renameSync(de, a); } catch (e) {
      if (intento >= 5 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e;
      esperar(200 * intento);
    }
  }
}

// Escribe a un temporal y renombra: así ni pendiente.json ni ultima.json quedan a medias.
function escribirJsonSeguro(ruta, datos) {
  const tmp = `${ruta}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try { fs.writeSync(fd, JSON.stringify(datos, null, 2)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  renombrar(tmp, ruta);
}

function leerJson(ruta) {
  try { return JSON.parse(fs.readFileSync(ruta, 'utf8')); } catch { return null; }
}

// Mueve a su lugar lo que esté pendiente. Se puede llamar las veces que sea: lo ya
// movido no está en nuevos/ y se salta. null = no había nada pendiente.
function aplicarPendiente() {
  if (!fs.existsSync(rutaPendiente())) return null;
  const plan = leerJson(rutaPendiente());
  if (!plan || !Array.isArray(plan.archivos)) {
    // Ilegible: se aparta para no reintentarlo en cada arranque; lo ya movido queda.
    renombrar(rutaPendiente(), `${rutaPendiente()}.invalido`);
    return { error: 'pendiente.json ilegible; se apartó como pendiente.json.invalido' };
  }

  const fallidos = [];
  for (const rel of plan.archivos) {
    const nuevo = path.join(dirActualizacion(), 'nuevos', rel);
    if (!fs.existsSync(nuevo)) continue;
    const destino = path.join(dirProyecto(), rel);
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      renombrar(nuevo, destino);
    } catch (e) {
      fallidos.push(`${rel} (${e.code || e.message})`);
    }
  }
  if (fallidos.length) return { commit: plan.commit, fallidos };

  escribirJsonSeguro(rutaUltima(), { commit: plan.commit, fecha: new Date().toISOString(), archivos: plan.archivos });
  fs.rmSync(rutaPendiente(), { force: true });
  fs.rmSync(path.join(dirActualizacion(), 'nuevos'), { recursive: true, force: true });
  return { commit: plan.commit, archivos: plan.archivos.length };
}

// Versión instalada por el actualizador (null si nunca se usó el nuevo) y si quedó algo sin mover.
function estadoInstalado() {
  return { ultima: leerJson(rutaUltima()), pendiente: fs.existsSync(rutaPendiente()) };
}

module.exports = { dirProyecto, dirActualizacion, rutaPendiente, renombrar, escribirJsonSeguro, aplicarPendiente, estadoInstalado };
