const { sql, getGeneralPool, getExtraGeneralPool, getBrandPool, parsePathBD, fuentesGeneralExtra } = require('../config/db');

// Fuentes GENERAL: la principal (compartida, las marcas históricas) + cada
// instalación ICG extra registrada en servers-extra.json con su propio bloque
// "general". Cada fuente extra reserva un rango de 10000 codTienda sintéticos
// (codTienda = codigo nativo de su EMPRESASCONTABLES + su offset), para que
// nunca choque con el 1-391 de la principal ni entre sí.
let _fuentes = null;
function fuentes() {
  if (_fuentes) return _fuentes;
  const principal = { isMain: true, host: null, marca: null, offset: 0, pool: getGeneralPool };
  const extras = fuentesGeneralExtra().map((f) => ({
    isMain: false, host: f.host, marca: f.marca, offset: f.offset,
    pool: () => getExtraGeneralPool(f.host),
  }));
  _fuentes = [principal, ...extras];
  return _fuentes;
}

// Ubica un codTienda "de GastosGD" (posiblemente con offset) en su fuente
// GENERAL, y devuelve también su código nativo dentro de esa fuente. Para las
// tiendas de siempre (offset 0), fuente=principal y nativo=codTienda: ningún
// comportamiento cambia.
function ubicar(codTienda) {
  const cod = Number(codTienda);
  const fs = fuentes();
  const extra = fs.find((f) => !f.isMain && cod > f.offset && cod < f.offset + 10000);
  return { fuente: extra || fs.find((f) => f.isMain), nativo: cod - (extra ? extra.offset : 0) };
}

async function tiendaInfoEnFuente(fuente, nativo) {
  const gen = await fuente.pool();
  const rq = gen.request().input('c', sql.Int, nativo);
  let filtroMarca = '';
  if (!fuente.isMain && fuente.marca) {
    rq.input('marca', sql.NVarChar, fuente.marca);
    filtroMarca = 'AND LTRIM(RTRIM(DIRECCION)) = @marca';
  }
  const r = await rq.query(`
    SELECT TOP 1 LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(DIRECCION)) AS Marca,
      LTRIM(RTRIM(POBLACION)) AS Empresa, LTRIM(RTRIM(PROVINCIA)) AS Zona
    FROM EMPRESASCONTABLES WHERE CODIGO = @c ${filtroMarca}
    ORDER BY EJERCICIO DESC`);
  return r.recordset[0] || null;
}

// Datos de una tienda (empresa contable), de la GENERAL principal o de una
// fuente extra -- la fuente se detecta por el offset del propio codTienda.
async function tiendaInfo(codTienda) {
  const { fuente, nativo } = ubicar(codTienda);
  return tiendaInfoEnFuente(fuente, nativo);
}

// BD operativa de una marca: busca su PATHBD en EMPRESAS por TITULO, en el
// pool que se le pase (la GENERAL principal, o la de una fuente extra).
async function brandDbEnPool(gen, marca) {
  const r = await gen.request().input('m', sql.NVarChar, marca).query(
    "SELECT TOP 1 PATHBD FROM EMPRESAS WHERE LTRIM(RTRIM(TITULO)) = @m AND ISNULL(PATHBD,'') <> ''");
  return r.recordset.length ? parsePathBD(r.recordset[0].PATHBD) : null;
}

// Resuelve { tienda, dbName, host, pool, offset, codNativo } o { tienda, error }
// para una tienda. `offset`/`codNativo` permiten al caller volver al código
// NATIVO cuando necesite consultar una columna de la BD de marca que use el
// código ICG puro (p. ej. FACTURASCOMPRA.ENLACE_EMPRESA).
async function resolverTienda(codTienda) {
  const { fuente, nativo } = ubicar(codTienda);
  const tienda = await tiendaInfoEnFuente(fuente, nativo);
  if (!tienda) return { error: 'tienda', mensaje: 'Tienda no encontrada' };
  const genFuente = fuente.isMain ? await getGeneralPool() : await fuente.pool();
  const bd = await brandDbEnPool(genFuente, tienda.Marca);
  if (!bd || !bd.database) return { tienda, error: 'db', mensaje: `No se resolvió la BD para la marca ${tienda.Marca}` };
  try {
    const pool = await getBrandPool(bd.database, bd.host);
    return { tienda, dbName: bd.database, host: bd.host, pool, offset: fuente.offset, codNativo: nativo };
  } catch (e) {
    return { tienda, dbName: bd.database, host: bd.host, error: 'conn', mensaje: `La BD ${bd.database} no está accesible (${e.message})`, offset: fuente.offset, codNativo: nativo };
  }
}

// Universo de tiendas de fuentes EXTRA (offset ya aplicado a CodTienda), sin
// filtrar por zona/marca válida -- cada caller filtra según su necesidad.
// Cacheado 5 min (misma TTL que alcance.js) para no golpear los SQL Server
// remotos en cada request.
let _tiendasExtraCache = null;
const TIENDAS_EXTRA_TTL_MS = 5 * 60 * 1000;
async function tiendasExtra() {
  if (_tiendasExtraCache && Date.now() - _tiendasExtraCache.ts < TIENDAS_EXTRA_TTL_MS) return _tiendasExtraCache.rows;
  const out = [];
  for (const f of fuentes().filter((x) => !x.isMain)) {
    try {
      const gen = await f.pool();
      const rq = gen.request();
      let where = '';
      if (f.marca) {
        rq.input('marca', sql.NVarChar, f.marca);
        where = 'WHERE LTRIM(RTRIM(DIRECCION)) = @marca';
      }
      const r = await rq.query(`
        SELECT CODIGO AS CodTienda, LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(DIRECCION)) AS Marca,
          LTRIM(RTRIM(POBLACION)) AS Empresa, LTRIM(RTRIM(PROVINCIA)) AS Zona
        FROM EMPRESASCONTABLES ${where}`);
      for (const row of r.recordset) out.push({ ...row, CodTienda: row.CodTienda + f.offset });
    } catch (e) {
      console.error(`[marca] GENERAL extra ${f.host} no disponible:`, e.message);
    }
  }
  _tiendasExtraCache = { rows: out, ts: Date.now() };
  return out;
}

module.exports = { tiendaInfo, resolverTienda, tiendasExtra, ubicar };
