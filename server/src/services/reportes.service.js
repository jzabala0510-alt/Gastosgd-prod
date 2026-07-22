const { sql, getPool } = require('../config/db');
const { resolverTienda } = require('./marca');
const { CTE_PENDIENTE, columnasLibres, expr } = require('./facturasCompra.service');

const esc = (s) => String(s).replace(/'/g, "''");

// GET /api/reportes — listado consolidado multi-marca (pendientes + faltantes del flujo).
// zona vacía = todas las zonas. soloERP=1 → solo pendientes ERP (sin faltantes del flujo).
async function listado({ desde, hasta, zona, codTienda, estado, soloERP }) {
  const appPool = await getPool();
  const vacio = { rows: [], totales: { count: 0, totalVes: 0, porEstado: {} } };

  // 1) Tiendas en alcance (codTienda > zona específica > todas las zonas)
  let scope = [];
  if (codTienda) {
    scope = [codTienda];
  } else if (zona) {
    const tr = await appPool.request().input('z', sql.NVarChar, zona)
      .query("SELECT DISTINCT CODIGO AS cod FROM GENERAL.dbo.EMPRESASCONTABLES WHERE LTRIM(RTRIM(PROVINCIA)) = @z");
    scope = tr.recordset.map((x) => x.cod);
  } else {
    const tr = await appPool.request()
      .query("SELECT DISTINCT CODIGO AS cod FROM GENERAL.dbo.EMPRESASCONTABLES WHERE CODIGO > 0");
    scope = tr.recordset.map((x) => x.cod);
  }
  if (!scope.length) return vacio;

  // 2) Estados del flujo de esas tiendas (clave cod|serie|num|n → estado)
  const fl = await appPool.request()
    .query(`SELECT CodTienda, NumSerie, NumFactura, N, Estado FROM dbo.GD_FacturaFlujo WHERE CodTienda IN (${scope.map(Number).join(',')})`);
  const flujoMap = new Map();
  for (const r of fl.recordset) flujoMap.set(`${r.CodTienda}|${(r.NumSerie || '').trim()}|${r.NumFactura}|${(r.N || '').trim()}`, r.Estado);

  // 3) Agrupar tiendas por marca (BD)
  const infoCache = {};
  const porBrand = {};
  for (const cod of scope) {
    const info = await resolverTienda(cod); infoCache[cod] = info;
    if (info.error) continue;
    const bk = `${info.host}|${info.dbName}`;
    if (!porBrand[bk]) porBrand[bk] = { pool: info.pool, codigos: [] };
    porBrand[bk].codigos.push(cod);
  }

  const rows = [];
  const seen = new Set();
  const addRow = (cod, d, est) => {
    const k = `${cod}|${(d.NUMSERIE || '').trim()}|${d.NUMFACTURA}|${(d.N || '').trim()}`;
    if (seen.has(k)) return;
    const fechaIso = d.FECHA ? new Date(d.FECHA).toISOString().slice(0, 10) : '';
    if (desde && fechaIso && fechaIso < desde) return;
    if (hasta && fechaIso && fechaIso > hasta) return;
    if (estado && est !== estado) return;
    seen.add(k);
    const info = infoCache[cod];
    rows.push({
      zona: info && info.tienda ? info.tienda.Zona : null,
      tienda: info && info.tienda ? info.tienda.Tienda : null,
      marca: info && info.tienda ? info.tienda.Marca : null,
      numserie: d.NUMSERIE, numfactura: d.NUMFACTURA, n: d.N,
      fecha: d.FECHA, proveedor: d.Proveedor, tipoGasto: d.TipoGasto,
      totalVes: Number(d.TotalVes) || 0, pendienteVes: Number(d.PendienteVes) || 0, estado: est,
    });
  };

  // 4) Por marca: facturas pendientes de pago (cualquier etapa viva). Estado = flujo o PENDIENTE_ANALISTA.
  for (const bk of Object.keys(porBrand)) {
    const b = porBrand[bk];
    const cols = await columnasLibres(b.pool, bk);
    const q = await b.pool.request().query(`
      ${CTE_PENDIENTE}
      SELECT ec.CODIGO AS codTienda, f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA,
        LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor,
        RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes,
        T.PENDIENTE AS PendienteVes,
        ISNULL(LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})), 'SIN ESPECIFICAR') AS TipoGasto
      FROM FACTURASCOMPRA f
        INNER JOIN CTE_TESORERIA T ON T.SERIE=f.NUMSERIE AND T.NUMERO=f.NUMFACTURA AND T.N=f.N
        LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR=f.CODPROVEEDOR
        INNER JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE=f.NUMSERIE AND cl.NUMFACTURA=f.NUMFACTURA AND cl.N=f.N
        LEFT JOIN SERIES s ON SUBSTRING(f.NUMSERIE, 1, 2)=s.SERIE
        LEFT JOIN GENERAL.dbo.EMPRESASCONTABLES ec
          ON ec.CODIGO=CAST(SUBSTRING(s.CONTABILIDADB, 6, 3) AS INT)
         AND ec.EJERCICIO=CAST(SUBSTRING(s.CONTABILIDADB, 2, 4) AS INT)
      WHERE ec.CODIGO IN (${b.codigos.map(Number).join(',')}) AND f.TIPODOC IN (12, 20)`);
    for (const d of q.recordset) {
      const est = flujoMap.get(`${d.codTienda}|${(d.NUMSERIE || '').trim()}|${d.NUMFACTURA}|${(d.N || '').trim()}`) || 'PENDIENTE_ANALISTA';
      addRow(d.codTienda, d, est);
    }
  }

  // 5) Facturas con flujo (p. ej. PAGADO) que ya NO están en el pendiente del ERP → traer por clave.
  // Se omite en modo soloERP (Gastos general): solo interesan pendientes del ERP.
  if (soloERP) {
    rows.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
    const porEstado = {};
    let totalVes = 0;
    for (const r of rows) { porEstado[r.estado] = (porEstado[r.estado] || 0) + 1; totalVes += r.totalVes; }
    return { rows, totales: { count: rows.length, totalVes: Math.round(totalVes * 100) / 100, porEstado } };
  }
  const faltantes = {};
  for (const r of fl.recordset) {
    const k = `${r.CodTienda}|${(r.NumSerie || '').trim()}|${r.NumFactura}|${(r.N || '').trim()}`;
    if (seen.has(k)) continue;
    const info = infoCache[r.CodTienda];
    if (!info || info.error) continue;
    const bk = `${info.host}|${info.dbName}`;
    if (!faltantes[bk]) faltantes[bk] = { pool: info.pool, rows: [] };
    faltantes[bk].rows.push(r);
  }
  for (const bk of Object.keys(faltantes)) {
    const b = faltantes[bk];
    const cols = await columnasLibres(b.pool, bk);
    const valores = b.rows.map((r) => `(N'${esc(r.NumSerie)}',${Number(r.NumFactura)},N'${esc(r.N)}')`).join(',');
    const q = await b.pool.request().query(`
      ;WITH K(NUMSERIE, NUMFACTURA, N) AS (SELECT * FROM (VALUES ${valores}) v(a, b, c))
      SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA,
        LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor,
        RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes,
        (SELECT SUM(RIP.F_GET_COTIZACION_RIP(ts.IMPORTE, ts.FECHADOCUMENTO, ts.FACTORMONEDA, ts.CODMONEDA, 4))
           FROM TESORERIA ts WHERE ts.SERIE=f.NUMSERIE AND ts.NUMERO=f.NUMFACTURA AND ts.N=f.N
             AND ts.ORIGEN='P' AND ts.ESTADO='P' AND ABS(ts.IMPORTE)>0.10) AS PendienteVes,
        ISNULL(LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})), 'SIN ESPECIFICAR') AS TipoGasto
      FROM FACTURASCOMPRA f
        INNER JOIN K ON K.NUMSERIE COLLATE DATABASE_DEFAULT=f.NUMSERIE COLLATE DATABASE_DEFAULT
                    AND K.NUMFACTURA=f.NUMFACTURA
                    AND K.N COLLATE DATABASE_DEFAULT=f.N COLLATE DATABASE_DEFAULT
        LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR=f.CODPROVEEDOR
        LEFT JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE=f.NUMSERIE AND cl.NUMFACTURA=f.NUMFACTURA AND cl.N=f.N`);
    const dmap = {};
    for (const d of q.recordset) dmap[`${(d.NUMSERIE || '').trim()}|${d.NUMFACTURA}|${(d.N || '').trim()}`] = d;
    for (const r of b.rows) {
      const d = dmap[`${(r.NumSerie || '').trim()}|${r.NumFactura}|${(r.N || '').trim()}`];
      if (d) addRow(r.CodTienda, d, r.Estado);
    }
  }

  rows.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const porEstado = {};
  let totalVes = 0;
  for (const r of rows) { porEstado[r.estado] = (porEstado[r.estado] || 0) + 1; totalVes += r.totalVes; }
  return { rows, totales: { count: rows.length, totalVes: Math.round(totalVes * 100) / 100, porEstado } };
}

// GET /api/reportes/saldos?zona=&codTienda=&fecha= — saldos y préstamos por tienda.
async function saldos({ zona, codTienda, fecha }) {
  const pool = await getPool();
  const rq = pool.request().input('f', sql.Date, fecha);
  let filtro;
  if (codTienda) {
    filtro = 'ec.CODIGO = @c'; rq.input('c', sql.Int, codTienda);
  } else if (zona) {
    filtro = 'LTRIM(RTRIM(ec.PROVINCIA)) = @z'; rq.input('z', sql.NVarChar, zona);
  } else {
    filtro = 'ec.CODIGO > 0'; // Todas las zonas
  }
  const r = await rq.query(`
    SELECT t.zona, t.tienda, t.marca, ISNULL(d.MontoDisponible, 0) AS saldo
    FROM (
      SELECT DISTINCT ec.CODIGO AS codTienda,
             LTRIM(RTRIM(ec.DESCRIPCION)) AS tienda,
             LTRIM(RTRIM(ec.DIRECCION))   AS marca,
             LTRIM(RTRIM(ec.PROVINCIA)) AS zona
      FROM GENERAL.dbo.EMPRESASCONTABLES ec
      WHERE ${filtro}
    ) t
    OUTER APPLY (
      -- Suma de bancos cargados + ajuste manual de Tesorería (si lo hubo).
      SELECT
        ISNULL((SELECT SUM(MontoDisponible) FROM dbo.GD_DispTienda WHERE CodTienda = t.codTienda AND Fecha = @f), 0)
        + ISNULL((SELECT MontoAjuste FROM dbo.GD_DispAjuste WHERE CodTienda = t.codTienda AND Fecha = @f), 0)
        AS MontoDisponible
    ) d
    ORDER BY t.tienda`);
  const rows = r.recordset.map((x) => ({
    zona: x.zona, tienda: x.tienda, marca: x.marca, saldo: Number(x.saldo) || 0,
  }));
  const totalSaldo = rows.reduce((a, x) => a + x.saldo, 0);
  return {
    rows,
    totales: { count: rows.length, totalSaldo: Math.round(totalSaldo * 100) / 100 },
  };
}

module.exports = { listado, saldos };
