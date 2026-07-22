const { sql, getGeneralPool, getBrandPool, parsePathBD } = require('../config/db');

// Datos de una tienda (empresa contable) desde GENERAL.EMPRESASCONTABLES.
// CODIGO no es único por sí solo: algunas empresas tienen una fila por EJERCICIO
// (ej. una vieja huérfana de un año anterior, sin Marca/Provincia, y la actual).
// ORDER BY EJERCICIO DESC se queda con la más reciente — sin esto, TOP 1 podía
// traer la fila vieja y romper la resolución de marca/BD (visto con TOP GROUP).
async function tiendaInfo(codTienda) {
  const gen = await getGeneralPool();
  const r = await gen.request().input('c', sql.Int, codTienda).query(`
    SELECT TOP 1 LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(DIRECCION)) AS Marca,
      LTRIM(RTRIM(POBLACION)) AS Empresa, LTRIM(RTRIM(PROVINCIA)) AS Zona
    FROM EMPRESASCONTABLES WHERE CODIGO = @c
    ORDER BY EJERCICIO DESC`);
  return r.recordset[0] || null;
}

// BD operativa de la marca (donde viven las FACTURASCOMPRA): { host, database }.
async function brandDbForMarca(marca) {
  const gen = await getGeneralPool();
  const r = await gen.request().input('m', sql.NVarChar, marca).query(
    "SELECT TOP 1 PATHBD FROM EMPRESAS WHERE LTRIM(RTRIM(TITULO)) = @m AND ISNULL(PATHBD,'') <> ''");
  return r.recordset.length ? parsePathBD(r.recordset[0].PATHBD) : null;
}

// Resuelve { tienda, dbName, host, pool } o { tienda, error } para una tienda.
async function resolverTienda(codTienda) {
  const tienda = await tiendaInfo(codTienda);
  if (!tienda) return { error: 'tienda', mensaje: 'Tienda no encontrada' };
  const bd = await brandDbForMarca(tienda.Marca);
  if (!bd || !bd.database) return { tienda, error: 'db', mensaje: `No se resolvió la BD para la marca ${tienda.Marca}` };
  try {
    const pool = await getBrandPool(bd.database, bd.host);
    return { tienda, dbName: bd.database, host: bd.host, pool };
  } catch (e) {
    return { tienda, dbName: bd.database, host: bd.host, error: 'conn', mensaje: `La BD ${bd.database} no está accesible (${e.message})` };
  }
}

module.exports = { tiendaInfo, brandDbForMarca, resolverTienda };
