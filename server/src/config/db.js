const sql = require('mssql');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Credenciales por servidor para marcas en un host físicamente distinto al
// principal (server/servers-extra.json, gitignored — no existe por defecto).
// Formato: { "host": { "user": "...", "password": "...", "port": 1433, "instance": "NOMBRE", "databases": "BD1,BD2" } }.
// "port", "instance" y "databases" son opcionales. El nombre real de la BD para
// conectar NO sale de aquí -- sigue viniendo del PATHBD de esa marca en
// GENERAL.EMPRESAS, igual que para el resto de las marcas; "databases" es solo
// informativo (se imprime al cargar) para ver de un vistazo qué aloja cada
// servidor. Un host ausente de este archivo usa DB_USER/DB_PASSWORD/DB_PORT
// como siempre.
let _extraServers = null;
function _cargarExtraServers() {
  if (_extraServers !== null) return _extraServers;
  _extraServers = {};
  try {
    const p = path.resolve(__dirname, '..', '..', 'servers-extra.json');
    if (fs.existsSync(p)) {
      const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
      for (const h of Object.keys(raw)) {
        const s = raw[h];
        _extraServers[h.toLowerCase()] = s;
        const destino = `${h}${s.instance ? `\\${s.instance}` : ''}${s.port ? `:${s.port}` : ''}`;
        console.log(`[db] servers-extra.json: ${destino}${s.databases ? ` -> ${s.databases}` : ''}`);
      }
    }
  } catch (e) {
    console.error('[db] Error leyendo servers-extra.json:', e.message);
  }
  return _extraServers;
}
function _credencialesExtra(host) {
  if (!host) return null;
  return _cargarExtraServers()[String(host).toLowerCase()] || null;
}

// Fuentes GENERAL extra: hosts de servers-extra.json que declaran un bloque
// "general" (instalación ICG independiente, con su propia BD GENERAL). Cada
// una reserva un rango de 10000 codTienda sintéticos (ver marca.js::ubicar()).
// Formato: "host": { ..., "general": { "database": "GENERAL", "marca": "LC WAIKIKI VEN", "offset": 20000 } }.
// "marca" es opcional (solo hace falta si esa GENERAL tiene más de una empresa
// registrada y hay que descartar el resto) -- filtra EMPRESASCONTABLES.DIRECCION,
// igual que EMPRESAS.TITULO ya filtra la marca en la GENERAL principal
// (EMPRESASCONTABLES no tiene columna CODEMPRESA, solo EMPRESAS la tiene).
function fuentesGeneralExtra() {
  const raw = _cargarExtraServers();
  const out = [];
  for (const host of Object.keys(raw)) {
    const g = raw[host].general;
    if (!g || !g.database || g.offset == null) continue;
    out.push({
      host,
      database: g.database,
      marca: g.marca || null,
      offset: Number(g.offset),
    });
  }
  return out;
}

function buildConfig(database, host, maxPool) {
  const extra = _credencialesExtra(host);
  const cfg = {
    server: host || process.env.DB_SERVER || 'localhost',
    user: extra ? extra.user : process.env.DB_USER,
    password: extra ? extra.password : process.env.DB_PASSWORD,
    database,
    options: {
      trustServerCertificate: String(process.env.DB_TRUST_CERT || 'true') === 'true',
      encrypt: String(process.env.DB_ENCRYPT || 'false') === 'true',
      ...(extra && extra.instance ? { instanceName: extra.instance } : {}),
    },
    pool: { max: maxPool || 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
  // Puerto: si el host extra trae uno, se usa ese. Si el host extra usa una
  // instancia con nombre SIN puerto explícito, se omite a propósito -- fijarlo
  // rompería la resolución por SQL Browser. En cualquier otro caso (sin extra,
  // o extra simple sin instancia) se usa el puerto global de siempre.
  if (extra && extra.port) {
    cfg.port = Number(extra.port);
  } else if (!extra || !extra.instance) {
    cfg.port = Number(process.env.DB_PORT || 1433);
  }
  return cfg;
}

let appPool = null;      // BD de la app/marca (Ardene): tablas GD_* + jerarquia
let generalPool = null;  // BD GENERAL: auth (USUARIOS / EMPRESAS)

function makePool(ref, database, host, maxPool, label) {
  return new sql.ConnectionPool(buildConfig(database, host, maxPool)).connect()
    .then((pool) => { console.log(`[db] Conectado a ${label} (${database}@${host || 'default'})`); return pool; })
    .catch((err) => { console.error(`[db] Error ${label} (${database}@${host || 'default'}):`, err.message); throw err; });
}

function getPool() {
  if (!appPool) {
    appPool = makePool('app', process.env.DB_NAME, process.env.DB_SERVER, 10, 'App').catch((e) => { appPool = null; throw e; });
  }
  return appPool;
}

// Pool de la BD GENERAL (para autenticacion contra usuarios ICG)
function getGeneralPool() {
  if (!generalPool) {
    const name = process.env.DB_GENERAL || 'GENERAL';
    generalPool = makePool('general', name, process.env.DB_SERVER, 5, 'GENERAL').catch((e) => { generalPool = null; throw e; });
  }
  return generalPool;
}

// Pools por BD de marca (multi-marca). Las facturas de compra viven en la BD
// operativa de cada marca, que en produccion estan en el servidor del PATHBD
// (p. ej. 172.16.20.30). En desarrollo, DB_FORCE_HOST redirige todo a localhost
// donde estan las copias de prueba (ARDENE, ADIDAS, BBW). Se cachea un pool por
// host+BD para soportar marcas repartidas en varios servidores.
const brandPools = new Map();

// Cache negativo: si una marca no tiene BD accesible, recordar el fallo unos
// segundos en vez de reintentar la conexión en cada tienda de esa marca. Sin
// esto, un reporte "todas las zonas" (cientos de tiendas, muchas marcas sin BD
// local) reintentaba el login fallido una vez por tienda — medido: 86s de
// espera para un reporte que con este cache baja a unos pocos segundos.
const brandFallos = new Map();
const FALLO_TTL_MS = 60 * 1000;

function getBrandPool(database, host) {
  const db = String(database || '').trim();
  if (!db) throw new Error('database de marca vacío');
  // Un host con credenciales propias en servers-extra.json es un servidor de
  // verdad distinto (no una copia del mismo server histórico) — DB_FORCE_HOST
  // no debe redirigirlo, o quedaría inalcanzable. Cualquier otro host se
  // comporta exactamente igual que siempre.
  const override = _credencialesExtra(host) ? '' : (process.env.DB_FORCE_HOST || '').trim();
  const realHost = override || host || process.env.DB_SERVER || 'localhost';
  const key = `${realHost}|${db}`.toUpperCase();

  const fallo = brandFallos.get(key);
  if (fallo && Date.now() - fallo.ts < FALLO_TTL_MS) return Promise.reject(fallo.error);

  if (!brandPools.has(key)) {
    const p = makePool('brand', db, realHost, 5, `Marca ${db}`).catch((e) => {
      brandPools.delete(key);
      brandFallos.set(key, { error: e, ts: Date.now() });
      throw e;
    });
    brandPools.set(key, p);
  }
  return brandPools.get(key);
}

// Pools de las BDs GENERAL de fuentes extra (una instalación ICG independiente
// por host, ver fuentesGeneralExtra()) -- mismo patrón de cache + fallo-negativo
// que brandPools/brandFallos arriba.
const extraGeneralPools = new Map();
const extraGeneralFallos = new Map();

function getExtraGeneralPool(host) {
  const extra = _credencialesExtra(host);
  if (!extra || !extra.general || !extra.general.database) {
    return Promise.reject(new Error(`Host ${host} no tiene bloque "general" en servers-extra.json`));
  }
  const key = String(host).toUpperCase();

  const fallo = extraGeneralFallos.get(key);
  if (fallo && Date.now() - fallo.ts < FALLO_TTL_MS) return Promise.reject(fallo.error);

  if (!extraGeneralPools.has(key)) {
    const p = makePool('extra-general', extra.general.database, host, 5, `GENERAL ${host}`).catch((e) => {
      extraGeneralPools.delete(key);
      extraGeneralFallos.set(key, { error: e, ts: Date.now() });
      throw e;
    });
    extraGeneralPools.set(key, p);
  }
  return extraGeneralPools.get(key);
}

// Extrae { host, database } de un PATHBD con formato "servidor:NOMBRE_BD"
// (p. ej. "172.16.20.30:BBW"). El nombre de la BD NO siempre coincide con la
// marca (AEO->WYNWOOD, CALVIN KLEIN->CK), por eso siempre se resuelve por aqui.
function parsePathBD(pathBD) {
  if (!pathBD) return { host: '', database: '' };
  const s = String(pathBD).trim();
  const idx = s.lastIndexOf(':');
  if (idx < 0) return { host: '', database: s };
  return { host: s.slice(0, idx).trim(), database: s.slice(idx + 1).trim() };
}

module.exports = { sql, getPool, getGeneralPool, getBrandPool, getExtraGeneralPool, fuentesGeneralExtra, parsePathBD };
