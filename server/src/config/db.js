const sql = require('mssql');
require('dotenv').config();

function buildConfig(database, host, maxPool) {
  return {
    server: host || process.env.DB_SERVER || 'localhost',
    port: Number(process.env.DB_PORT || 1433),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
    options: {
      trustServerCertificate: String(process.env.DB_TRUST_CERT || 'true') === 'true',
      encrypt: String(process.env.DB_ENCRYPT || 'false') === 'true',
    },
    pool: { max: maxPool || 10, min: 0, idleTimeoutMillis: 30000 },
    connectionTimeout: 15000,
    requestTimeout: 30000,
  };
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
  const override = (process.env.DB_FORCE_HOST || '').trim();
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

module.exports = { sql, getPool, getGeneralPool, getBrandPool, parsePathBD };
