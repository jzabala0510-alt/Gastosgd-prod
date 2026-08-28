const { sql, getPool } = require('../config/db');
const { resolverTienda, tiendasExtra } = require('./marca');
const { CTE_PENDIENTE, columnasLibres, expr } = require('./facturasCompra.service');
const bancosService = require('./bancos.service');

const esc = (s) => String(s).replace(/'/g, "''");

// Etapas "vivas" (no resueltas todavía) para el reporte "Pendientes por fecha de
// solicitud". DEVUELTO cuenta como pendiente: necesita que el Analista la reenvíe,
// no es un cierre. PAGADO y RECHAZADO quedan afuera a propósito (ya se resolvieron).
const ESTADOS_PENDIENTES = ['PENDIENTE_ANALISTA', 'PENDIENTE_TESORERIA', 'PENDIENTE_AUDITORIA', 'PENDIENTE_PAGO', 'PAGO_EN_REVISION', 'DEVUELTO'];

// GET /api/reportes — listado consolidado multi-marca (pendientes + faltantes del flujo).
// zona vacía = todas las zonas. soloERP=1 → solo pendientes ERP (sin faltantes del flujo).
// soloPendientes=1 → cualquier etapa de ESTADOS_PENDIENTES (en vez de un solo `estado`).
// soloPresupuestos=1 → solo gastos marcados EsPresupuesto (cualquier estado, incl. ya
// pagados — por eso este flag NUNCA implica soloERP, que los escondería al pagarse).
async function listado({ desde, hasta, zona, codTienda, estado, soloERP, soloPendientes, soloPresupuestos }) {
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
    for (const t of await tiendasExtra()) if (t.Zona === zona) scope.push(t.CodTienda);
  } else {
    const tr = await appPool.request()
      .query("SELECT DISTINCT CODIGO AS cod FROM GENERAL.dbo.EMPRESASCONTABLES WHERE CODIGO > 0");
    scope = tr.recordset.map((x) => x.cod);
    scope.push(...(await tiendasExtra()).map((t) => t.CodTienda));
  }
  if (!scope.length) return vacio;

  // 2) Estados del flujo de esas tiendas (clave cod|serie|num|n → {estado, esPresupuesto})
  const fl = await appPool.request()
    .query(`SELECT CodTienda, NumSerie, NumFactura, N, Estado, EsPresupuesto FROM dbo.GD_FacturaFlujo WHERE CodTienda IN (${scope.map(Number).join(',')})`);
  const flujoMap = new Map();
  for (const r of fl.recordset) flujoMap.set(`${r.CodTienda}|${(r.NumSerie || '').trim()}|${r.NumFactura}|${(r.N || '').trim()}`, { estado: r.Estado, esPresupuesto: !!r.EsPresupuesto });

  // 3) Agrupar tiendas por marca (BD). "codigos" guarda el código NATIVO (sin
  // offset) -- lo que espera GENERAL.EMPRESASCONTABLES.CODIGO del lado de la
  // marca (ver paso 4); el offset se reaplica ahí al leer los resultados.
  const infoCache = {};
  const porBrand = {};
  for (const cod of scope) {
    const info = await resolverTienda(cod); infoCache[cod] = info;
    if (info.error) continue;
    const bk = `${info.host}|${info.dbName}`;
    if (!porBrand[bk]) porBrand[bk] = { pool: info.pool, offset: info.offset || 0, codigos: [] };
    porBrand[bk].codigos.push(cod - (info.offset || 0));
  }

  const rows = [];
  const seen = new Set();
  const addRow = (cod, d, est, esPresupuesto) => {
    const k = `${cod}|${(d.NUMSERIE || '').trim()}|${d.NUMFACTURA}|${(d.N || '').trim()}`;
    if (seen.has(k)) return;
    // El rango Desde/Hasta filtra por Fecha de Solicitud (no la fecha de la factura),
    // a pedido del cliente. Cuando la marca no tiene esa columna, expr() la trae NULL.
    const fechaIso = d.FechaSolicitud ? new Date(d.FechaSolicitud).toISOString().slice(0, 10) : '';
    // Si hay un rango activo y la factura no tiene FechaSolicitud, no se puede confirmar
    // que caiga dentro del rango — se excluye (antes se colaba siempre, con la columna
    // Fecha en blanco, sin respetar el rango elegido).
    if ((desde || hasta) && !fechaIso) return;
    if (desde && fechaIso < desde) return;
    if (hasta && fechaIso > hasta) return;
    if (estado && est !== estado) return;
    if (soloPendientes && !ESTADOS_PENDIENTES.includes(est)) return;
    if (soloPresupuestos && !esPresupuesto) return;
    seen.add(k);
    const info = infoCache[cod];
    rows.push({
      codTienda: cod,
      zona: info && info.tienda ? info.tienda.Zona : null,
      tienda: info && info.tienda ? info.tienda.Tienda : null,
      marca: info && info.tienda ? info.tienda.Marca : null,
      numserie: d.NUMSERIE, numfactura: d.NUMFACTURA, n: d.N,
      fecha: d.FechaSolicitud, fechaFactura: d.FECHA, proveedor: d.Proveedor, tipoGasto: d.TipoGasto,
      totalVes: Number(d.TotalVes) || 0, pendienteVes: Number(d.PendienteVes) || 0, estado: est,
      esPresupuesto: !!esPresupuesto,
    });
  };

  // 4) Por marca: facturas pendientes de pago (cualquier etapa viva). Estado = flujo o PENDIENTE_ANALISTA.
  for (const bk of Object.keys(porBrand)) {
    const b = porBrand[bk];
    const cols = await columnasLibres(b.pool, bk);
    const q = await b.pool.request().query(`
      ${CTE_PENDIENTE}
      SELECT ec.CODIGO AS codTienda, f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA,
        ${expr(cols, 'FECHASOLICITUD', 'DATE')} AS FechaSolicitud,
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
      const cod = d.codTienda + b.offset; // reaplica el offset -> codTienda de GastosGD
      const flu = flujoMap.get(`${cod}|${(d.NUMSERIE || '').trim()}|${d.NUMFACTURA}|${(d.N || '').trim()}`);
      addRow(cod, d, flu ? flu.estado : 'PENDIENTE_ANALISTA', flu ? flu.esPresupuesto : false);
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
        ${expr(cols, 'FECHASOLICITUD', 'DATE')} AS FechaSolicitud,
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
      if (d) addRow(r.CodTienda, d, r.Estado, r.EsPresupuesto);
    }
  }

  rows.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  const porEstado = {};
  let totalVes = 0;
  for (const r of rows) { porEstado[r.estado] = (porEstado[r.estado] || 0) + 1; totalVes += r.totalVes; }
  return { rows, totales: { count: rows.length, totalVes: Math.round(totalVes * 100) / 100, porEstado } };
}

// GET /api/reportes/saldos?zona=&codTienda=&fecha= — saldos por tienda, desglosados por
// banco (mismo patrón que fondos.service.js::zonaConSaldos(), la pantalla de Carga de
// Saldos) en vez de un solo número unificado.
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

  // Tiendas de fuentes GENERAL extra que apliquen al mismo filtro (codTienda >
  // zona > todas) -- GENERAL.dbo.EMPRESASCONTABLES de arriba nunca las ve, vive
  // en el server principal. Se traen aparte (ya con offset) y se unen abajo.
  const extraTiendas = (await tiendasExtra()).filter((t) =>
    codTienda ? t.CodTienda === Number(codTienda) : (zona ? t.Zona === zona : true));

  const [r, activos, rExtra] = await Promise.all([
    rq.query(`
      SELECT t.codTienda, t.zona, t.tienda, t.marca, d.IdBanco, d.MontoDisponible AS monto, a.MontoAjuste AS ajuste
      FROM (
        SELECT DISTINCT ec.CODIGO AS codTienda,
               LTRIM(RTRIM(ec.DESCRIPCION)) AS tienda,
               LTRIM(RTRIM(ec.DIRECCION))   AS marca,
               LTRIM(RTRIM(ec.PROVINCIA)) AS zona
        FROM GENERAL.dbo.EMPRESASCONTABLES ec
        WHERE ${filtro}
      ) t
      OUTER APPLY (
        SELECT IdBanco, MontoDisponible FROM dbo.GD_DispTienda WHERE CodTienda = t.codTienda AND Fecha = @f
      ) d
      OUTER APPLY (
        -- Ajuste manual de Tesorería: es por tienda, sin banco asociado (GD_DispAjuste no tiene IdBanco).
        SELECT MontoAjuste FROM dbo.GD_DispAjuste WHERE CodTienda = t.codTienda AND Fecha = @f
      ) a
      ORDER BY t.tienda`),
    bancosService.listarActivos(),
    extraTiendas.length ? pool.request().input('f', sql.Date, fecha).query(`
      SELECT t.codTienda, t.zona, t.tienda, t.marca, d.IdBanco, d.MontoDisponible AS monto, a.MontoAjuste AS ajuste
      FROM (VALUES ${extraTiendas.map((t) => `(${Number(t.CodTienda)}, N'${esc(t.Zona || '')}', N'${esc(t.Tienda || '')}', N'${esc(t.Marca || '')}')`).join(',')}) t(codTienda, zona, tienda, marca)
      OUTER APPLY (SELECT IdBanco, MontoDisponible FROM dbo.GD_DispTienda WHERE CodTienda = t.codTienda AND Fecha = @f) d
      OUTER APPLY (SELECT MontoAjuste FROM dbo.GD_DispAjuste WHERE CodTienda = t.codTienda AND Fecha = @f) a`)
      : Promise.resolve({ recordset: [] }),
  ]);

  const porTienda = new Map();
  const idsConDatos = new Set();
  for (const row of [...r.recordset, ...rExtra.recordset]) {
    if (!porTienda.has(row.codTienda)) {
      porTienda.set(row.codTienda, {
        codTienda: row.codTienda, zona: row.zona, tienda: row.tienda, marca: row.marca,
        bancos: {}, ajuste: Number(row.ajuste) || 0,
      });
    }
    if (row.IdBanco != null) {
      porTienda.get(row.codTienda).bancos[row.IdBanco] = Number(row.monto) || 0;
      idsConDatos.add(row.IdBanco);
    }
  }

  // Columnas: bancos activos + cualquier banco con plata registrada aunque esté inactivo
  // (para no esconder ese saldo del desglose por haberse dado de baja después de usarse).
  const idsActivos = new Set(activos.map((b) => b.IdBanco));
  const idsExtra = [...idsConDatos].filter((id) => !idsActivos.has(id));
  let bancosExtra = [];
  if (idsExtra.length) {
    const rb = await pool.request().query(`SELECT IdBanco, Nombre FROM dbo.GD_Banco WHERE IdBanco IN (${idsExtra.map(Number).join(',')})`);
    bancosExtra = rb.recordset;
  }
  const bancos = [...activos, ...bancosExtra];

  // Total = TODO lo registrado en GD_DispTienda (igual que el cálculo anterior, sin
  // filtrar por banco activo) + el ajuste — el desglose por banco no debe restar plata
  // del total que ya se veía.
  const rows = [...porTienda.values()].map((t) => {
    const totalBancos = Object.values(t.bancos).reduce((a, v) => a + v, 0);
    return { ...t, saldo: Math.round((totalBancos + t.ajuste) * 100) / 100 };
  });
  const totalSaldo = rows.reduce((a, x) => a + x.saldo, 0);
  return {
    bancos,
    rows,
    totales: { count: rows.length, totalSaldo: Math.round(totalSaldo * 100) / 100 },
  };
}

module.exports = { listado, saldos };
