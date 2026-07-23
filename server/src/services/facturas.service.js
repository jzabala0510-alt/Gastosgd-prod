const { sql, getPool } = require('../config/db');
const { resolverTienda } = require('./marca');
const { CTE_PENDIENTE_TIENDA, columnasLibres, expr } = require('./facturasCompra.service');

const ESTADO_DEFAULT = 'PENDIENTE_ANALISTA';

const claveFactura = (x) => `${(x.NUMSERIE ?? x.NumSerie).trim()}|${x.NUMFACTURA ?? x.NumFactura}|${(x.N).trim()}`;

async function getOrCreateFlujo(appPool, { codTienda, numserie, numfactura, n, marca }) {
  const r = await appPool.request()
    .input('c', sql.Int, codTienda).input('s', sql.NVarChar, numserie)
    .input('f', sql.Int, numfactura).input('n', sql.NVarChar, n)
    .query('SELECT IdFlujo, Estado FROM dbo.GD_FacturaFlujo WHERE CodTienda=@c AND NumSerie=@s AND NumFactura=@f AND N=@n');
  if (r.recordset.length) return r.recordset[0];
  const ins = await appPool.request()
    .input('c', sql.Int, codTienda).input('s', sql.NVarChar, numserie)
    .input('f', sql.Int, numfactura).input('n', sql.NVarChar, n).input('m', sql.NVarChar, marca || null)
    .query(`INSERT INTO dbo.GD_FacturaFlujo (CodTienda, NumSerie, NumFactura, N, Marca, Estado)
            OUTPUT INSERTED.IdFlujo, INSERTED.Estado VALUES (@c,@s,@f,@n,@m,'${ESTADO_DEFAULT}')`);
  return ins.recordset[0];
}

// Gastos pendientes por pagar de una tienda (facturas ICG + estado del flujo overlay).
async function listarPendientes(codTienda, estadoFiltro) {
  const r = await resolverTienda(codTienda);
  const base = { tienda: { codTienda, ...(r.tienda || {}) }, dbMarca: r.dbName || null };
  if (r.error) return { ...base, disponibleLocal: false, aviso: r.mensaje, facturas: [] };

  const cols = await columnasLibres(r.pool, `${r.host}|${r.dbName}`);
  const fac = await r.pool.request().input('e', sql.Int, codTienda).query(`
    ${CTE_PENDIENTE_TIENDA}
    SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.SUFACTURA, f.FECHA, f.FECHASUFACTURA, f.CODPROVEEDOR,
      f.TIPODOC,
      LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor,
      RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes,
      T.PENDIENTE AS PendienteVes,
      ${expr(cols, 'NUMCONTROL')} AS NUMCONTROL,
      ISNULL(LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})), 'SIN ESPECIFICAR') AS TipoGasto,
      ${expr(cols, 'FECHASOLICITUD', 'DATE')} AS FechaSolicitud,
      ${expr(cols, 'ANULADO', 'INT')} AS ANULADO
    FROM FACTURASCOMPRA f
      INNER JOIN CTE_TESORERIA T ON T.SERIE = f.NUMSERIE AND T.NUMERO = f.NUMFACTURA AND T.N = f.N
      LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR
      LEFT JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE = f.NUMSERIE AND cl.NUMFACTURA = f.NUMFACTURA AND cl.N = f.N
    WHERE f.ENLACE_EMPRESA = @e AND f.TIPODOC IN (12, 20)
    ORDER BY f.FECHA DESC`);

  const appPool = await getPool();
  const fl = await appPool.request().input('e', sql.Int, codTienda)
    .query('SELECT NumSerie, NumFactura, N, Estado FROM dbo.GD_FacturaFlujo WHERE CodTienda=@e');
  const estados = new Map(fl.recordset.map((x) => [claveFactura(x), x.Estado]));

  let facturas = fac.recordset.map((f) => ({ ...f, Estado: estados.get(claveFactura(f)) || ESTADO_DEFAULT }));
  if (estadoFiltro) facturas = facturas.filter((f) => f.Estado === estadoFiltro);

  return { ...base, disponibleLocal: true, total: facturas.length, facturas };
}

// Marca como vista por el analista una factura en estado final informativo (PAGADO o RECHAZADO).
async function marcarVisto({ codTienda, numserie, numfactura, n }) {
  const pool = await getPool();
  await pool.request()
    .input('c', sql.Int, Number(codTienda)).input('s', sql.NVarChar, String(numserie))
    .input('f', sql.Int, Number(numfactura)).input('n', sql.NVarChar, String(n))
    .query(`UPDATE dbo.GD_FacturaFlujo SET VistoPorAnalista = 1
            WHERE CodTienda=@c AND NumSerie=@s AND NumFactura=@f AND N=@n AND Estado IN ('PAGADO','RECHAZADO')`);
}

// Últimas facturas en estado PAGADO para una tienda (ventana en horas).
async function pagadasRecientes(codTienda, horas) {
  const appPool = await getPool();
  const fl = await appPool.request().input('c', sql.Int, codTienda).input('h', sql.Int, horas).query(`
    SELECT TOP 50 NumSerie, NumFactura, N, FechaActualizacion AS FechaPago
    FROM dbo.GD_FacturaFlujo
    WHERE Estado = 'PAGADO' AND CodTienda = @c
      AND FechaActualizacion >= DATEADD(hour, -@h, GETDATE())
    ORDER BY FechaActualizacion DESC`);

  if (!fl.recordset.length) return [];

  const r = await resolverTienda(codTienda);
  if (r.error) {
    return fl.recordset.map((x) => ({
      numserie: x.NumSerie.trim(), numfactura: x.NumFactura, n: x.N.trim(),
      fechaPago: x.FechaPago, fecha: null, proveedor: null, totalVes: null,
    }));
  }

  const esc = (s) => String(s).replace(/'/g, "''");
  const valores = fl.recordset
    .map((x) => `(N'${esc(x.NumSerie.trim())}',${Number(x.NumFactura)},N'${esc(x.N.trim())}')`)
    .join(',');

  const fac = await r.pool.request().query(`
    ;WITH K(NUMSERIE, NUMFACTURA, N) AS (SELECT * FROM (VALUES ${valores}) v(a, b, c))
    SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.FECHA,
      LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor,
      RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes
    FROM FACTURASCOMPRA f
      INNER JOIN K ON K.NUMSERIE COLLATE DATABASE_DEFAULT = f.NUMSERIE COLLATE DATABASE_DEFAULT
                  AND K.NUMFACTURA = f.NUMFACTURA
                  AND K.N COLLATE DATABASE_DEFAULT = f.N COLLATE DATABASE_DEFAULT
      LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR`);

  const dmap = {};
  for (const d of fac.recordset)
    dmap[`${d.NUMSERIE.trim()}|${d.NUMFACTURA}|${d.N.trim()}`] = d;

  return fl.recordset.map((x) => {
    const d = dmap[`${x.NumSerie.trim()}|${x.NumFactura}|${x.N.trim()}`] || {};
    return {
      numserie: x.NumSerie.trim(), numfactura: x.NumFactura, n: x.N.trim(),
      fechaPago: x.FechaPago, fecha: d.FECHA || null,
      proveedor: d.Proveedor || null,
      totalVes: d.TotalVes != null ? Number(d.TotalVes) : null,
    };
  });
}

// Disponible del día (en Bs) + gastos PENDIENTE_TESORERIA que cubre, acumulado.
async function cobertura(codTienda, fecha) {
  // Disponible viene de la BD propia (GASTOSGD) — consultarlo antes de resolver marca
  // para que esté disponible aunque la BD de marca no sea accesible.
  // = suma de los bancos cargados en Saldos + el ajuste manual de Tesorería (si lo hubo).
  const appPool = await getPool();
  const disp = await appPool.request().input('c', sql.Int, codTienda).input('f', sql.Date, fecha)
    .query(`
      SELECT
        (SELECT SUM(MontoDisponible) FROM dbo.GD_DispTienda WHERE CodTienda=@c AND Fecha=@f) AS SumaBancos,
        (SELECT MontoAjuste FROM dbo.GD_DispAjuste WHERE CodTienda=@c AND Fecha=@f) AS Ajuste`);
  const fila = disp.recordset[0] || {};
  const disponible = (Number(fila.SumaBancos) || 0) + (Number(fila.Ajuste) || 0);

  const r = await resolverTienda(codTienda);
  if (r.error) return { tienda: r.tienda, disponibleLocal: false, disponible, aviso: r.mensaje, gastos: [] };

  const fl = await appPool.request().input('e', sql.Int, codTienda)
    .query('SELECT NumSerie, NumFactura, N, Estado FROM dbo.GD_FacturaFlujo WHERE CodTienda=@e');
  const estados = new Map(fl.recordset.map((x) => [claveFactura(x), x.Estado]));

  const cols = await columnasLibres(r.pool, `${r.host}|${r.dbName}`);
  const fac = await r.pool.request().input('e', sql.Int, codTienda).query(`
    ${CTE_PENDIENTE_TIENDA}
    SELECT f.NUMSERIE, f.NUMFACTURA, f.N, f.SUFACTURA, f.FECHA,
      LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor, T.PENDIENTE AS PendienteVes,
      ISNULL(LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})), 'SIN ESPECIFICAR') AS TipoGasto
    FROM FACTURASCOMPRA f
      INNER JOIN CTE_TESORERIA T ON T.SERIE = f.NUMSERIE AND T.NUMERO = f.NUMFACTURA AND T.N = f.N
      LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR
      LEFT JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE=f.NUMSERIE AND cl.NUMFACTURA=f.NUMFACTURA AND cl.N=f.N
    WHERE f.ENLACE_EMPRESA = @e AND f.TIPODOC IN (12, 20)
    ORDER BY f.FECHA DESC`);

  let acum = 0;
  const gastos = fac.recordset
    .filter((f) => (estados.get(claveFactura(f)) || ESTADO_DEFAULT) === 'PENDIENTE_TESORERIA')
    .map((f) => {
      const v = Number(f.PendienteVes) || 0;
      acum += v;
      return {
        NumSerie: f.NUMSERIE, NumFactura: f.NUMFACTURA, N: f.N, Proveedor: f.Proveedor, FechaGasto: f.FECHA,
        TipoGasto: f.TipoGasto,
        Monto: Math.round(v * 100) / 100, Acumulado: Math.round(acum * 100) / 100, Cubierto: acum <= disponible,
      };
    });

  return {
    tienda: r.tienda, disponibleLocal: true, disponible,
    totalPendiente: Math.round(acum * 100) / 100, gastos,
  };
}

// Tesorería corrige el total del día: guarda la diferencia entre lo que Tesorería
// quiere ver como total y la suma de bancos (que carga el Analista en Saldos).
async function guardarAjusteDisponibilidad({ codTienda, fecha, montoDisponible, idUsuario }) {
  const pool = await getPool();

  const sum = await pool.request().input('c', sql.Int, codTienda).input('f', sql.Date, fecha)
    .query('SELECT SUM(MontoDisponible) AS Total FROM dbo.GD_DispTienda WHERE CodTienda=@c AND Fecha=@f');
  const sumaBancos = Number(sum.recordset[0]?.Total) || 0;
  const ajuste = Number(montoDisponible) - sumaBancos;

  await pool.request()
    .input('c', sql.Int, codTienda).input('f', sql.Date, fecha)
    .input('a', sql.Decimal(18, 2), ajuste).input('u', sql.Int, idUsuario)
    .query(`MERGE dbo.GD_DispAjuste AS t
      USING (SELECT @c AS CodTienda, @f AS Fecha) AS s
        ON t.CodTienda=s.CodTienda AND t.Fecha=s.Fecha
      WHEN MATCHED THEN UPDATE SET MontoAjuste=@a, IdUsuario=@u, FechaRegistro=GETDATE()
      WHEN NOT MATCHED THEN INSERT (CodTienda,Fecha,MontoAjuste,IdUsuario) VALUES (@c,@f,@a,@u);`);
}

// Detalle completo de una factura (cabecera + líneas + adjuntos + aprobaciones).
async function detalle({ codTienda, numserie, numfactura, n }) {
  const r = await resolverTienda(codTienda);
  if (r.error) return { error: r.mensaje, status: 409 };

  const cols = await columnasLibres(r.pool, `${r.host}|${r.dbName}`);
  const f = await r.pool.request()
    .input('s', sql.NVarChar, numserie).input('f', sql.Int, numfactura).input('n', sql.NVarChar, n)
    .query(`SELECT TOP 1 f.NUMSERIE, f.NUMFACTURA, f.N, f.SUFACTURA, f.FECHA, f.FECHASUFACTURA, f.CODPROVEEDOR, f.TIPODOC,
        LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor, LTRIM(RTRIM(p.CIF)) AS RifProveedor,
        RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes,
        (SELECT SUM(RIP.F_GET_COTIZACION_RIP(ts.IMPORTE, ts.FECHADOCUMENTO, ts.FACTORMONEDA, ts.CODMONEDA, 4))
           FROM TESORERIA ts WHERE ts.SERIE=f.NUMSERIE AND ts.NUMERO=f.NUMFACTURA AND ts.N=f.N
             AND ts.ORIGEN='P' AND ts.ESTADO='P' AND ABS(ts.IMPORTE)>0.10) AS PendienteVes,
        f.TOTALNETO, f.CODMONEDA, f.ENLACE_EMPRESA,
        ${expr(cols, 'NUMCONTROL')} AS NUMCONTROL, ${expr(cols, 'OBSERVACIONES')} AS OBSERVACIONES, LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})) AS TipoGasto, ${expr(cols, 'ANULADO', 'INT')} AS ANULADO
      FROM FACTURASCOMPRA f
      LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR = f.CODPROVEEDOR
      LEFT JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE=f.NUMSERIE AND cl.NUMFACTURA=f.NUMFACTURA AND cl.N=f.N
      WHERE f.NUMSERIE=@s AND f.NUMFACTURA=@f AND f.N=@n`);
  if (!f.recordset.length) return { error: 'Factura no encontrada', status: 404 };
  const factura = f.recordset[0];

  // Líneas del gasto (detalle de ALBCOMPRALIN)
  const lin = await r.pool.request()
    .input('s', sql.NVarChar, numserie).input('f', sql.Int, numfactura).input('n', sql.NVarChar, n)
    .query(`SELECT acc.NUMALBARAN, LTRIM(RTRIM(acl.DESCRIPCION)) AS Descripcion, LTRIM(RTRIM(acl.REFERENCIA)) AS Referencia,
              acl.UNIDADESTOTAL AS Cantidad, acl.PRECIO, acl.TOTAL
            FROM FACTURASCOMPRA fc
              INNER JOIN ALBCOMPRACAB acc ON acc.NUMSERIEFAC=fc.NUMSERIE AND acc.NUMFAC=fc.NUMFACTURA AND acc.NFAC=fc.N
              INNER JOIN ALBCOMPRALIN acl ON acl.NUMSERIE=acc.NUMSERIE AND acl.NUMALBARAN=acc.NUMALBARAN AND acl.N=acc.N
            WHERE fc.NUMSERIE=@s AND fc.NUMFACTURA=@f AND fc.N=@n`);

  const appPool = await getPool();
  const flq = await appPool.request().input('c', sql.Int, codTienda).input('s', sql.NVarChar, numserie)
    .input('f', sql.Int, numfactura).input('n', sql.NVarChar, n)
    .query('SELECT IdFlujo, Estado FROM dbo.GD_FacturaFlujo WHERE CodTienda=@c AND NumSerie=@s AND NumFactura=@f AND N=@n');
  const flujo = flq.recordset[0];
  let adjuntos = [], aprobaciones = [];
  if (flujo) {
    adjuntos = (await appPool.request().input('id', sql.Int, flujo.IdFlujo)
      .query('SELECT IdAdjunto, Tipo, NombreOriginal, RutaArchivo, Mime, Tamano, FechaSubida FROM dbo.GD_FacturaAdjunto WHERE IdFlujo=@id ORDER BY IdAdjunto')).recordset;
    aprobaciones = (await appPool.request().input('id', sql.Int, flujo.IdFlujo)
      .query(`SELECT a.Etapa, a.Decision, a.Comentario, a.Fecha, u.Nombre AS Usuario
              FROM dbo.GD_FacturaAprobacion a LEFT JOIN dbo.GD_Usuario u ON u.IdUsuario=a.IdUsuario
              WHERE a.IdFlujo=@id ORDER BY a.Fecha`)).recordset;
  }
  return {
    ...factura, tienda: { codTienda: Number(codTienda), ...r.tienda },
    Estado: flujo ? flujo.Estado : ESTADO_DEFAULT, lineas: lin.recordset, adjuntos, aprobaciones,
  };
}

// Guarda soportes ya escritos en disco por multer (files: [{filename, originalname, mimetype, size}]).
async function guardarAdjuntos({ codTienda, numserie, numfactura, n, marca, tipo, files }) {
  const appPool = await getPool();
  const flujo = await getOrCreateFlujo(appPool, { codTienda, numserie, numfactura, n, marca });
  if (flujo.Estado === 'PAGADO') return { error: 'La factura ya está pagada. No se pueden agregar más soportes.', status: 409 };
  const tipoBody = (tipo || '').toUpperCase();
  const out = [];
  for (const file of files) {
    const t = ['FACTURA', 'SOPORTE', 'FOTO', 'OTRO'].includes(tipoBody) ? tipoBody : (file.mimetype.startsWith('image/') ? 'FOTO' : 'SOPORTE');
    const ins = await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('t', sql.NVarChar, t)
      .input('ruta', sql.NVarChar, file.filename).input('nom', sql.NVarChar, file.originalname)
      .input('mime', sql.NVarChar, file.mimetype).input('tam', sql.Int, file.size)
      .query(`INSERT INTO dbo.GD_FacturaAdjunto (IdFlujo, Tipo, RutaArchivo, NombreOriginal, Mime, Tamano)
              OUTPUT INSERTED.IdAdjunto VALUES (@id,@t,@ruta,@nom,@mime,@tam)`);
    out.push({ idAdjunto: ins.recordset[0].IdAdjunto, nombre: file.originalname, tipo: t });
  }
  return { adjuntos: out };
}

// Elimina un soporte (fila). Los COMPROBANTE de pago no se borran. El archivo físico
// lo borra la ruta (necesita UPLOAD_DIR, que es config HTTP, no de datos).
async function eliminarAdjunto(id) {
  const appPool = await getPool();
  const r = await appPool.request().input('id', sql.Int, id)
    .query('SELECT IdAdjunto, Tipo, RutaArchivo FROM dbo.GD_FacturaAdjunto WHERE IdAdjunto=@id');
  if (!r.recordset.length) return { error: 'Soporte no encontrado', status: 404 };
  const adj = r.recordset[0];
  if ((adj.Tipo || '').toUpperCase() === 'COMPROBANTE') {
    return { error: 'Los comprobantes de pago no se pueden eliminar', status: 403 };
  }
  await appPool.request().input('id', sql.Int, id).query('DELETE FROM dbo.GD_FacturaAdjunto WHERE IdAdjunto=@id');
  return { ok: true, rutaArchivo: adj.RutaArchivo };
}

const DECISIONES = ['APROBADO', 'DEVUELTO', 'RECHAZADO'];

// Transición de etapa (Analista/Tesorería/Auditoría). etapa/estadosReq/mapEstado los
// fija cada ruta (ver rutas /analista, /tesoreria, /auditoria).
async function accionFactura(etapa, estadosReq, mapEstado, { codTienda, numserie, numfactura, n, marca, decision, comentario, idUsuario }) {
  const permitidos = Array.isArray(estadosReq) ? estadosReq : [estadosReq];
  if (!DECISIONES.includes(decision)) return { error: 'Decisión inválida', status: 400 };
  const appPool = await getPool();
  const flujo = await getOrCreateFlujo(appPool, { codTienda, numserie, numfactura, n, marca });
  if (!permitidos.includes(flujo.Estado)) {
    return { error: `La factura no está pendiente en esta etapa (estado ${flujo.Estado})`, status: 409 };
  }
  const nuevo = mapEstado[decision];
  if (!nuevo) return { error: 'Decisión inválida para esta etapa', status: 400 };
  await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('e', sql.NVarChar, nuevo)
    .query('UPDATE dbo.GD_FacturaFlujo SET Estado=@e, FechaActualizacion=GETDATE(), VistoPorAnalista=0 WHERE IdFlujo=@id');
  await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('et', sql.NVarChar, etapa)
    .input('u', sql.Int, idUsuario).input('d', sql.NVarChar, decision).input('c', sql.NVarChar, comentario || null)
    .query('INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario) VALUES (@id,@et,@u,@d,@c)');
  return { estado: nuevo };
}

// Requiere al menos 1 archivo (comprobante obligatorio, validado en la ruta). Guarda los
// adjuntos con tipo COMPROBANTE y cambia el estado a PAGADO en una sola operación.
async function pagar({ codTienda, numserie, numfactura, n, marca, idUsuario, files }) {
  const appPool = await getPool();
  const flujo = await getOrCreateFlujo(appPool, { codTienda, numserie, numfactura, n, marca });
  if (flujo.Estado !== 'PENDIENTE_PAGO') {
    return { error: `La factura no está pendiente de pago (estado: ${flujo.Estado})`, status: 409 };
  }
  for (const file of files) {
    await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('t', sql.NVarChar, 'COMPROBANTE')
      .input('ruta', sql.NVarChar, file.filename).input('nom', sql.NVarChar, file.originalname)
      .input('mime', sql.NVarChar, file.mimetype).input('tam', sql.Int, file.size)
      .query(`INSERT INTO dbo.GD_FacturaAdjunto (IdFlujo, Tipo, RutaArchivo, NombreOriginal, Mime, Tamano)
              VALUES (@id, @t, @ruta, @nom, @mime, @tam)`);
  }
  await appPool.request().input('id', sql.Int, flujo.IdFlujo)
    .query(`UPDATE dbo.GD_FacturaFlujo SET Estado='PAGO_EN_REVISION', FechaActualizacion=GETDATE() WHERE IdFlujo=@id`);
  const comentario = `Comprobante de pago registrado (${files.length} archivo${files.length > 1 ? 's' : ''}). Pendiente de confirmación por Auditoría.`;
  await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('u', sql.Int, idUsuario)
    .input('c', sql.NVarChar, comentario)
    .query(`INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario)
            VALUES (@id, 'PAGADOR', @u, 'PAGO_EN_REVISION', @c)`);
  return { estado: 'PAGO_EN_REVISION', archivos: files.length };
}

// El auditor revisa el comprobante de pago ya subido por el pagador:
//   decision=CONFIRMADO → PAGADO definitivo   ·   decision=DEVUELTO → PENDIENTE_PAGO
async function confirmarPago({ codTienda, numserie, numfactura, n, marca, decision, comentario, idUsuario }) {
  const appPool = await getPool();
  const flujo = await getOrCreateFlujo(appPool, { codTienda, numserie, numfactura, n, marca });
  if (flujo.Estado !== 'PAGO_EN_REVISION') {
    return { error: `La factura no está pendiente de confirmación (estado: ${flujo.Estado})`, status: 409 };
  }
  const nuevo = decision === 'CONFIRMADO' ? 'PAGADO' : 'PENDIENTE_PAGO';
  await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('e', sql.NVarChar, nuevo)
    .query('UPDATE dbo.GD_FacturaFlujo SET Estado=@e, FechaActualizacion=GETDATE(), VistoPorAnalista=0 WHERE IdFlujo=@id');
  await appPool.request().input('id', sql.Int, flujo.IdFlujo).input('u', sql.Int, idUsuario)
    .input('d', sql.NVarChar, decision).input('c', sql.NVarChar, comentario || null)
    .query(`INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario)
            VALUES (@id, 'AUDITOR_PAGO', @u, @d, @c)`);
  return { estado: nuevo };
}

// Bandeja cross-tienda por estado (overlay), filtrada por el alcance de zona del usuario.
async function bandeja(estado, alcance) {
  const appPool = await getPool();
  const fl = await appPool.request().input('e', sql.NVarChar, estado)
    .query('SELECT TOP 200 IdFlujo, CodTienda, Marca, NumSerie, NumFactura, N, Estado FROM dbo.GD_FacturaFlujo WHERE Estado=@e ORDER BY FechaActualizacion DESC');

  const filas = alcance.irrestricto ? fl.recordset : fl.recordset.filter((row) => alcance.codTiendas.has(row.CodTienda));

  const cache = {};
  const out = [];
  for (const row of filas) {
    let info = cache[row.CodTienda];
    if (!info) { info = await resolverTienda(row.CodTienda); cache[row.CodTienda] = info; }
    let fac = null;
    if (!info.error) {
      try {
        const cols = await columnasLibres(info.pool, `${info.host}|${info.dbName}`);
        const q = await info.pool.request()
          .input('s', sql.NVarChar, row.NumSerie).input('f', sql.Int, row.NumFactura).input('n', sql.NVarChar, row.N)
          .query(`SELECT TOP 1 f.FECHA, LTRIM(RTRIM(p.NOMPROVEEDOR)) AS Proveedor,
                    RIP.F_GET_COTIZACION_RIP(f.TOTALNETO, f.FECHASUFACTURA, f.FACTORMONEDA, f.CODMONEDA, 4) AS TotalVes,
                    ISNULL(LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})), 'SIN ESPECIFICAR') AS TipoGasto
                  FROM FACTURASCOMPRA f
                  LEFT JOIN PROVEEDORES p ON p.CODPROVEEDOR=f.CODPROVEEDOR
                  LEFT JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE=f.NUMSERIE AND cl.NUMFACTURA=f.NUMFACTURA AND cl.N=f.N
                  WHERE f.NUMSERIE=@s AND f.NUMFACTURA=@f AND f.N=@n`);
        fac = q.recordset[0];
      } catch { /* ignore */ }
    }
    out.push({
      codTienda: row.CodTienda, tienda: info.tienda ? info.tienda.Tienda : null, zona: info.tienda ? info.tienda.Zona : null,
      marca: row.Marca, numserie: row.NumSerie, numfactura: row.NumFactura, n: row.N, estado: row.Estado,
      proveedor: fac ? fac.Proveedor : null, fecha: fac ? fac.FECHA : null, total: fac ? fac.TotalVes : null,
      tipoGasto: fac ? fac.TipoGasto : null,
    });
  }
  return out;
}

module.exports = {
  listarPendientes, marcarVisto, pagadasRecientes, cobertura, guardarAjusteDisponibilidad,
  detalle, guardarAdjuntos, eliminarAdjunto, accionFactura, pagar, confirmarPago, bandeja,
};
