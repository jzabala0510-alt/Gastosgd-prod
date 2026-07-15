const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

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

// ── Descarga + extracción + copia ───────────────────────────────────────────
// Nunca se sobreescriben (a cualquier profundidad), aunque el .zip los trajera
// por error: secretos, dependencias instaladas y adjuntos reales. Se revisa por
// segmento de ruta (no una lista exhaustiva) para no dejar afuera combinaciones
// como "server/.env" o "server/node_modules" por descuido.
function crearFiltro(targetDir) {
  return (_src, dest) => {
    const rel = path.relative(targetDir, dest).split(path.sep).join('/');
    if (!rel) return true; // el propio targetDir
    const segmentos = rel.split('/');
    if (segmentos.includes('node_modules')) return false;
    if (segmentos.includes('.git')) return false;
    if (segmentos[segmentos.length - 1] === '.env') return false; // .env a cualquier profundidad
    if (rel === 'server/uploads' || rel.startsWith('server/uploads/')) return false;
    return true;
  };
}

// Descarga el .zip del branch configurado (repo público, sin token), lo extrae en una
// carpeta temporal y copia su contenido sobre targetDir. No corre npm install ni build:
// asume que lo que hay en el repo (incl. client/dist ya compilado) es lo que se sirve.
async function descargarYAplicar(opts = {}) {
  const owner = opts.owner || process.env.UPDATE_REPO_OWNER;
  const repo = opts.repo || process.env.UPDATE_REPO_NAME;
  const branch = opts.branch || process.env.UPDATE_REPO_BRANCH || 'main';
  const targetDir = opts.targetDir || process.env.UPDATE_TARGET_DIR || path.resolve(__dirname, '..', '..', '..');

  if (!owner || !repo) throw new Error('UPDATE_REPO_OWNER / UPDATE_REPO_NAME no configurados en .env');

  const url = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${branch}`;
  console.log(`[updater] 1/6 descargando ${url}`);
  const res = await fetch(url);
  console.log(`[updater] 2/6 respuesta HTTP ${res.status}`);
  if (!res.ok) throw new Error(`No se pudo descargar el repositorio (HTTP ${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  console.log(`[updater] 3/6 descarga completa: ${buffer.length} bytes`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gastosgd-update-'));
  console.log(`[updater] 4/6 extrayendo a carpeta temporal ${tmpDir}`);
  try {
    const zip = new AdmZip(buffer);
    zip.extractAllTo(tmpDir, true);
    console.log('[updater] 5/6 extracción completa');

    // GitHub mete todo el contenido bajo una única carpeta raíz "{repo}-{branch}/".
    const entradas = fs.readdirSync(tmpDir);
    if (!entradas.length) throw new Error('El .zip descargado está vacío');
    const origen = path.join(tmpDir, entradas[0]);

    console.log(`[updater] 6/6 copiando ${origen} -> ${targetDir}`);
    fs.cpSync(origen, targetDir, { recursive: true, force: true, filter: crearFiltro(targetDir) });
    console.log('[updater] copia completa, listo para reiniciar');

    return { owner, repo, branch, targetDir, aplicadoEn: new Date().toISOString() };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { verificarClave, intentoPermitido, registrarIntentoFallido, limpiarIntentos, descargarYAplicar };
