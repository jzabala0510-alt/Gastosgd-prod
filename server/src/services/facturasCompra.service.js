// Helpers compartidos para leer FACTURASCOMPRA en las BDs de marca (ICG).
// Usado por facturas.service.js (bandeja/detalle por tienda) y reportes.service.js
// (consolidado multi-marca) para no duplicar el mismo CTE/deteccion de columnas.

// Facturas con pago pendiente en el ERP (TESORERIA ORIGEN='P', ESTADO='P'), en Bs.
const CTE_PENDIENTE = `
  WITH CTE_TESORERIA AS (
    SELECT SERIE, NUMERO, N,
      SUM(RIP.F_GET_COTIZACION_RIP(IMPORTE, FECHADOCUMENTO, FACTORMONEDA, CODMONEDA, 4)) AS PENDIENTE
    FROM TESORERIA WHERE ORIGEN='P' AND ESTADO='P' AND ABS(IMPORTE) > 0.10
    GROUP BY SERIE, NUMERO, N
  )`;

// Los "campos libres" de ICG (FACTURASCOMPRACAMPOSLIBRES) varían por empresa: hay
// marcas que no tienen OBSERVACIONES, NUMCONTROL, etc. Detectamos qué columnas
// existen en cada BD de marca (cacheado por host+BD) y emitimos NULL para las
// ausentes, para que lista/detalle funcionen en todas las marcas sin reventar.
const colsCache = new Map();
async function columnasLibres(pool, cacheKey) {
  if (!colsCache.has(cacheKey)) {
    const r = await pool.request()
      .query("SELECT name FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FACTURASCOMPRACAMPOSLIBRES')");
    colsCache.set(cacheKey, new Set(r.recordset.map((x) => x.name.toUpperCase())));
  }
  return colsCache.get(cacheKey);
}
// Expresión SQL: cl.COL si la marca tiene esa columna, NULL tipado si no.
const expr = (cols, nombre, tipoNull = 'NVARCHAR(MAX)') =>
  cols.has(nombre.toUpperCase()) ? `cl.${nombre}` : `CAST(NULL AS ${tipoNull})`;

module.exports = { CTE_PENDIENTE, columnasLibres, expr };
