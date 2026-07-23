// Helpers compartidos para leer FACTURASCOMPRA en las BDs de marca (ICG).
// Usado por facturas.service.js (bandeja/detalle por tienda) y reportes.service.js
// (consolidado multi-marca) para no duplicar el mismo CTE/deteccion de columnas.

// Facturas con pago pendiente en el ERP (TESORERIA ORIGEN='P', ESTADO='P'), en Bs.
// Agrega TODA la empresa (no filtra tienda) porque reportes.service.js la usa para
// varias tiendas a la vez (consolidado por marca).
const CTE_PENDIENTE = `
  WITH CTE_TESORERIA AS (
    SELECT SERIE, NUMERO, N,
      SUM(RIP.F_GET_COTIZACION_RIP(IMPORTE, FECHADOCUMENTO, FACTORMONEDA, CODMONEDA, 4)) AS PENDIENTE
    FROM TESORERIA WHERE ORIGEN='P' AND ESTADO='P' AND ABS(IMPORTE) > 0.10
    GROUP BY SERIE, NUMERO, N
  )`;

// Misma CTE, acotada a UNA tienda (requiere que el caller ya tenga declarado el
// parámetro @e = codTienda y filtre WHERE f.ENLACE_EMPRESA=@e en el SELECT
// principal, igual que CTE_PENDIENTE). RIP.F_GET_COTIZACION_RIP no es "inlineable"
// (llama a otro escalar, dbo.F_GET_COTIZACION, por dentro), así que SQL Server la
// evalúa fila por fila; agregar TODA la empresa antes de filtrar por tienda hace
// que se evalúe para miles de facturas ajenas a la tienda pedida. Medido en TOP
// GROUP: ~2x más rápido (235ms → ~108ms) al acotar primero con este EXISTS.
const CTE_PENDIENTE_TIENDA = `
  WITH CTE_TESORERIA AS (
    SELECT t.SERIE, t.NUMERO, t.N,
      SUM(RIP.F_GET_COTIZACION_RIP(t.IMPORTE, t.FECHADOCUMENTO, t.FACTORMONEDA, t.CODMONEDA, 4)) AS PENDIENTE
    FROM TESORERIA t
    WHERE t.ORIGEN='P' AND t.ESTADO='P' AND ABS(t.IMPORTE) > 0.10
      AND EXISTS (
        SELECT 1 FROM FACTURASCOMPRA f2
        WHERE f2.ENLACE_EMPRESA = @e AND f2.TIPODOC IN (12, 20)
          AND f2.NUMSERIE = t.SERIE AND f2.NUMFACTURA = t.NUMERO AND f2.N = t.N
      )
    GROUP BY t.SERIE, t.NUMERO, t.N
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

module.exports = { CTE_PENDIENTE, CTE_PENDIENTE_TIENDA, columnasLibres, expr };
