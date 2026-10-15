const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const AdmZip = require('adm-zip');
const { dirProyecto, dirActualizacion, rutaPendiente, escribirJsonSeguro } = require('../utils/actualizacionPendiente');

// ── Clave de acceso (sección aparte, no ligada a usuarios ICG) ──────────────
// Compara por hash + timingSafeEqual: evita timing attacks y el error de
// "longitudes distintas" que tira timingSafeEqual si se comparan strings crudos.
function verificarClave(clave) {
  const real = process.env.UPDATER_PASSWORD || '';
  if (!real) return false; // sin clave configurada en .env => fail-closed, nunca entra
  const a = crypto.createHash('sha256').update(String(clave || '')).digest();
  const b = crypto.createHash('sha256').update(real).digest();
  return crypto.timingSafeEqual(a, b);
}

// ── Rate limit simple en memoria para /login (por IP) ───────────────────────
// El endpoint puede desplegar código arbitrario en producción si alguien adivina
// la clave — 5 intentos fallidos por 15 minutos es proporcional a ese riesgo.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const intentos = new Map(); // ip -> { count, desde }

function intentoPermitido(ip) {
  const ahora = Date.now();
  const registro = intentos.get(ip);
  if (!registro || ahora - registro.desde > RATE_LIMIT_WINDOW_MS) return true;
  return registro.count < RATE_LIMIT_MAX;
}

function registrarIntentoFallido(ip) {
  const ahora = Date.now();
  const registro = intentos.get(ip);
  if (!registro || ahora - registro.desde > RATE_LIMIT_WINDOW_MS) {
    intentos.set(ip, { count: 1, desde: ahora });
  } else {
    registro.count++;
  }
}

function limpiarIntentos(ip) {
  intentos.delete(ip);
}

// ── Descarga + preparación ──────────────────────────────────────────────────
// Nunca se sobreescriben (a cualquier profundidad), aunque el .zip los trajera
// por error: secretos, dependencias instaladas y adjuntos reales. Se revisa por
// segmento de ruta (no una lista exhaustiva) para no dejar afuera combinaciones
// como "server/.env" o "server/node_modules" por descuido.
function excluido(rel) {
  const segmentos = rel.split('/');
  const nombre = segmentos[segmentos.length - 1];
  if (segmentos.includes('node_modules') || segmentos.includes('.git')) return true;
  if (nombre === '.env') return true; // .env a cualquier profundidad
  if (nombre === 'servers-extra.json') return true; // credenciales de marcas en otro servidor
  if (rel.startsWith('server/uploads/')) return true;
  if (segmentos[0] === '.actualizacion') return true; // la propia carpeta de trabajo del actualizador
  return false;
}

const sinCR = (buf) => Buffer.from(buf.filter((b) => b !== 13));

// Igual = mismos bytes, o mismos salvo los \r (un archivo con CRLF en el servidor y
// LF en el repo es el mismo archivo; no hace falta reescribirlo).
function igualAlInstalado(destino, datos) {
  if (!fs.existsSync(destino)) return false;
  const actual = fs.readFileSync(destino);
  return actual.equals(datos) || sinCR(actual).equals(sinCR(datos));
}

function escribirVerificado(ruta, datos) {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  const fd = fs.openSync(ruta, 'w');
  try { fs.writeSync(fd, datos); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  if (!fs.readFileSync(ruta).equals(datos)) throw new Error(`No se pudo escribir completo ${ruta}`);
}

// Descarga el .zip del branch configurado (repo público, sin token) y deja listos en
// .actualizacion/nuevos/ solo los archivos que cambiaron, sin tocar todavía la app.
// La app se toca recién en aplicarPendiente() (utils/actualizacionPendiente.js), con
// renombres. No corre npm install ni build. `opts.zip` (Buffer) evita la descarga (pruebas).
async function prepararActualizacion(opts = {}) {
  const owner = opts.owner || process.env.UPDATE_REPO_OWNER;
  const repo = opts.repo || process.env.UPDATE_REPO_NAME;
  const branch = opts.branch || process.env.UPDATE_REPO_BRANCH || 'main';
  const targetDir = dirProyecto();

  if (fs.existsSync(rutaPendiente())) {
    throw new Error('Hay una actualización anterior sin terminar de aplicar. Reinicia el servicio para que se complete y vuelve a intentar.');
  }

  let buffer = opts.zip;
  if (!buffer) {
    if (!owner || !repo) throw new Error('UPDATE_REPO_OWNER / UPDATE_REPO_NAME no configurados en .env');
    const url = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
    console.log(`[updater] 1/4 descargando ${url}`);
    const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
    if (!res.ok) throw new Error(`No se pudo descargar el repositorio (HTTP ${res.status})`);
    buffer = Buffer.from(await res.arrayBuffer());
    console.log(`[updater] 2/4 descarga completa: ${buffer.length} bytes`);
  }

  const zip = new AdmZip(buffer);
  const commit = (zip.getZipComment() || '').trim() || null; // GitHub pone ahí el commit del .zip
  // GitHub mete todo el contenido bajo una única carpeta raíz "{repo}-{branch}/".
  const archivos = zip.getEntries().filter((e) => !e.isDirectory);
  if (!archivos.length) throw new Error('El .zip descargado está vacío');

  const cambios = [];
  for (const e of archivos) {
    const rel = e.entryName.split('/').slice(1).join('/');
    if (!rel || excluido(rel)) continue;
    const datos = e.getData();
    if (!igualAlInstalado(path.join(targetDir, rel), datos)) cambios.push({ rel, datos });
  }
  console.log(`[updater] 3/4 commit ${commit ? commit.slice(0, 7) : '?'}: ${cambios.length} archivo(s) cambiaron de ${archivos.length}`);
  if (!cambios.length) return { commit, archivos: [] };

  const nuevos = path.join(dirActualizacion(), 'nuevos');
  fs.rmSync(nuevos, { recursive: true, force: true }); // restos de una preparación que no llegó al final
  for (const c of cambios) escribirVerificado(path.join(nuevos, c.rel), c.datos);

  // Los de server/ al final: al tocar el primero, nodemon reinicia el backend, y para
  // entonces ya conviene que todo lo demás esté en su lugar.
  const lista = cambios.map((c) => c.rel)
    .sort((a, b) => Number(a.startsWith('server/')) - Number(b.startsWith('server/')) || a.localeCompare(b));
  escribirJsonSeguro(rutaPendiente(), { commit, preparado: new Date().toISOString(), archivos: lista });
  console.log(`[updater] 4/4 ${lista.length} archivo(s) listos en ${nuevos}`);
  return { commit, archivos: lista };
}

module.exports = { verificarClave, intentoPermitido, registrarIntentoFallido, limpiarIntentos, prepararActualizacion, excluido };
