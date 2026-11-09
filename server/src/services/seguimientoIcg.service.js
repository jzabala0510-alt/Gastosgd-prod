const { sql, getPool } = require('../config/db');
const { resolverTienda } = require('./marca');
const { tiposDocumentoCompra, sqlTipos } = require('./facturasCompra.service');

// Seguimiento de ICG: cada INTERVALO revisa en ICG los gastos que están en el flujo de
// GastosGD y anota en GD_FacturaFlujo si ICG ya los saldó (IcgEstado 'S', con la fecha y
// el tipo de pago del saldado) o si siguen pendientes ('P'). La primera vez que ve un gasto
// saldado deja una línea en su historial (Etapa SISTEMA, Decision SALDADO_ICG) con la fecha
// en que ICG lo saldó, para que quede en su lugar dentro del historial.
// Solo informativo: no cambia el estado de ningún gasto.
//
// "Pendiente" = lo que queda por pagar en los vencimientos 'P' (de más de 0,10 cada uno: ICG
// deja líneas 'P' en cero) suma más de 0,10. Las líneas 'P' negativas (retenciones, notas de
// crédito) no cuentan como deuda: sin esto, una retención cargada después del pago haría ver
// el gasto como reabierto. "Saldado" = no pendiente y con al menos un vencimiento 'S'.
// Fechas de saldado futuras (errores de tipeo en ICG: 5026, 8202…) no se toman.

const INTERVALO_MS = 10 * 60 * 1000;
const DIAS_PAGADOS = 120; // los PAGADO más viejos ya no se revisan
const TANDA = 500;        // claves por consulta (3 parámetros c/u; SQL Server acepta 2100)

const clave = (serie, numero, n) => `${String(serie).trim()}|${numero}|${String(n).trim()}`;

// Estado en ICG de una tanda de facturas: pendientes, saldados, fecha y tipo del último saldado.
async function estadoTanda(pool, tipos, filas) {
  const rq = pool.request();
  const valores = filas.map((f, i) => {
    rq.input(`s${i}`, sql.NVarChar, String(f.NumSerie).trim()).input(`f${i}`, sql.Int, f.NumFactura).input(`n${i}`, sql.NVarChar, String(f.N).trim());
    return `(@s${i}, @f${i}, @n${i})`;
  }).join(',');
  const enTipos = sqlTipos(tipos);
  const r = await rq.query(`
    WITH K(SERIE, NUMERO, N) AS (SELECT * FROM (VALUES ${valores}) v(a, b, c))
    SELECT K.SERIE, K.NUMERO, K.N,
      SUM(CASE WHEN t.ESTADO = 'P' AND ABS(t.IMPORTE) > 0.10 THEN t.IMPORTE ELSE 0 END) AS PendienteImporte,
      SUM(CASE WHEN t.ESTADO = 'S' THEN 1 ELSE 0 END) AS Saldadas,
      MAX(CASE WHEN t.ESTADO = 'S' AND t.FECHASALDADO <= DATEADD(day, 1, GETDATE()) THEN t.FECHASALDADO END) AS FechaSaldado,
      (SELECT TOP 1 LTRIM(RTRIM(tp.DESCRIPCION)) FROM TESORERIA t2 LEFT JOIN TIPOSPAGO tp ON tp.CODTIPOPAGO = t2.CODTIPOPAGO
        WHERE t2.ORIGEN = 'P' AND t2.TIPODOCUMENTO IN (${enTipos}) AND t2.SERIE = K.SERIE AND t2.NUMERO = K.NUMERO
          AND t2.N = K.N AND t2.ESTADO = 'S'
        ORDER BY CASE WHEN t2.FECHASALDADO <= DATEADD(day, 1, GETDATE()) THEN 0 ELSE 1 END, t2.FECHASALDADO DESC, t2.POSICION DESC) AS TipoPago
    FROM K
      LEFT JOIN TESORERIA t ON t.ORIGEN = 'P' AND t.TIPODOCUMENTO IN (${enTipos})
        AND t.SERIE = K.SERIE AND t.NUMERO = K.NUMERO AND t.N = K.N
    GROUP BY K.SERIE, K.NUMERO, K.N`);
  return r.recordset;
}

// Aplica los cambios en GASTOSGD: actualiza las columnas Icg* y, la primera vez que un gasto
// pasa a saldado, agrega la línea al historial. Se decide con lo que tenía la fila al
// actualizarla (OUTPUT deleted): nunca estuvo saldado (o la detección de reabiertos olvidó ese
// saldado), así dos revisiones simultáneas, o un reabierto que ICG vuelve a saldar mientras los
// reabiertos están en simulación, no duplican el historial. Todo o nada (transacción).
// En tandas (4 parámetros por fila). Devuelve cuántos pasaron a saldado.
async function guardarCambios(cambios) {
  const app = await getPool();
  let nuevos = 0;
  for (let i = 0; i < cambios.length; i += 400) {
    const parte = cambios.slice(i, i + 400);
    const rq = app.request();
    const valores = parte.map((c, j) => {
      rq.input(`i${j}`, sql.Int, c.idFlujo).input(`e${j}`, sql.Char(1), c.estado)
        .input(`d${j}`, sql.DateTime, c.fecha).input(`t${j}`, sql.NVarChar(60), c.tipo ? c.tipo.slice(0, 60) : null);
      return `(@i${j}, @e${j}, @d${j}, @t${j})`;
    }).join(',');
    const r = await rq.query(`
      SET NOCOUNT ON; SET XACT_ABORT ON;
      DECLARE @c TABLE (IdFlujo INT, Estado CHAR(1), Fecha DATETIME, Tipo NVARCHAR(60));
      DECLARE @o TABLE (IdFlujo INT, Antes CHAR(1), FechaAntes DATETIME, Ahora CHAR(1), Fecha DATETIME, Tipo NVARCHAR(60));
      INSERT INTO @c VALUES ${valores};
      BEGIN TRAN;
      UPDATE f SET IcgEstado = c.Estado,
        IcgSaldadoFecha = CASE WHEN c.Estado = 'S' THEN c.Fecha ELSE f.IcgSaldadoFecha END,
        IcgTipoPago = CASE WHEN c.Estado = 'S' THEN c.Tipo ELSE f.IcgTipoPago END
      OUTPUT inserted.IdFlujo, deleted.IcgEstado, deleted.IcgSaldadoFecha, inserted.IcgEstado, inserted.IcgSaldadoFecha, inserted.IcgTipoPago INTO @o
      FROM dbo.GD_FacturaFlujo f JOIN @c c ON c.IdFlujo = f.IdFlujo;
      INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario, Fecha)
      SELECT o.IdFlujo, 'SISTEMA', NULL, 'SALDADO_ICG',
        N'Saldado en ICG' + ISNULL(N' el ' + CONVERT(varchar(10), o.Fecha, 103), N'') + ISNULL(N' · ' + o.Tipo, N''),
        ISNULL(o.Fecha, GETDATE())
      FROM @o o WHERE o.Ahora = 'S' AND ISNULL(o.Antes, '') <> 'S' AND o.FechaAntes IS NULL;
      COMMIT TRAN;
      SELECT COUNT(*) AS n FROM @o WHERE Ahora = 'S' AND ISNULL(Antes, '') <> 'S' AND FechaAntes IS NULL;`);
    nuevos += r.recordset[0].n;
  }
  return nuevos;
}

// Una revisión completa. Devuelve un resumen (también sirve para probarlo a mano).
// Con { simular: true } no escribe nada y devuelve los cambios que haría.
async function revisar({ simular = false } = {}) {
  const app = await getPool();
  const fl = await app.request().query(`
    SELECT IdFlujo, CodTienda, NumSerie, NumFactura, N, Estado, IcgEstado, IcgSaldadoFecha, IcgTipoPago
    FROM dbo.GD_FacturaFlujo
    WHERE Estado NOT IN ('RECHAZADO', 'TRANSFERIDO')
      AND (Estado <> 'PAGADO' OR FechaActualizacion >= DATEADD(day, -${DIAS_PAGADOS}, GETDATE()))`);

  // Agrupar por BD de marca (varias tiendas comparten BD).
  const porTienda = new Map();
  for (const x of fl.recordset) {
    if (!porTienda.has(x.CodTienda)) porTienda.set(x.CodTienda, []);
    porTienda.get(x.CodTienda).push(x);
  }
  const porBd = new Map();
  const errores = [];
  for (const [cod, filas] of porTienda) {
    let info;
    try { info = await resolverTienda(cod); } catch (e) { info = { error: true, mensaje: e.message }; }
    if (info.error) { // tienda sin BD accesible: se intenta en la próxima vuelta
      const bd = info.dbName || `tienda ${cod}`;
      if (!errores.some((e) => e.bd === bd)) errores.push({ bd, mensaje: info.mensaje });
      continue;
    }
    const bk = `${info.host}|${info.dbName}`;
    if (!porBd.has(bk)) porBd.set(bk, { info, filas: [] });
    porBd.get(bk).filas.push(...filas);
  }

  const cambios = [];
  // Reabiertos confirmados: ya estaban guardados como pendientes con un saldado anterior
  // (vuelta pasada) y en esta vuelta ICG los sigue mostrando pendientes. Dos observaciones
  // seguidas: un "desaldar y volver a saldar" en ICG para cambiar la forma de pago no alcanza
  // a dispararlo. Solo estos se aplican (aplicarReabiertos).
  const reabiertos = [];
  let revisados = 0;
  for (const g of porBd.values()) {
    try {
      const tipos = await tiposDocumentoCompra(g.info.pool, `${g.info.host}|${g.info.dbName}`);
      if (!tipos.length) continue;
      const porClave = new Map();
      for (const x of g.filas) {
        const k = clave(x.NumSerie, x.NumFactura, x.N);
        if (!porClave.has(k)) porClave.set(k, []);
        porClave.get(k).push(x);
      }
      const claves = [...porClave.values()].map((v) => v[0]);
      for (let i = 0; i < claves.length; i += TANDA) {
        for (const r of await estadoTanda(g.info.pool, tipos, claves.slice(i, i + TANDA))) {
          const estado = Number(r.PendienteImporte) > 0.10 ? 'P' : (r.Saldadas > 0 ? 'S' : null);
          const fecha = estado === 'S' ? r.FechaSaldado : null;
          // "SELECCIONE FORMA DE PAGO" es el valor vacío de ICG: no dice nada, no se muestra.
          const tipo = estado === 'S' && r.TipoPago && !/^SELECCIONE/i.test(r.TipoPago) ? r.TipoPago : null;
          for (const fila of porClave.get(clave(r.SERIE, r.NUMERO, r.N)) || []) {
            revisados++;
            if (!estado) continue; // sin vencimientos en ICG: no se sabe, no se toca
            if (estado === 'S') {
              const igual = fila.IcgEstado === 'S' && String(fila.IcgSaldadoFecha || '') === String(fecha || '')
                && (fila.IcgTipoPago || null) === tipo;
              if (!igual) cambios.push({ idFlujo: fila.IdFlujo, estado, fecha, tipo });
            } else if (fila.IcgEstado !== 'P') {
              // Pendiente en ICG. Si antes estaba saldado, se conservan la fecha y el tipo de
              // ese saldado (los usará la detección de reabiertos).
              cambios.push({ idFlujo: fila.IdFlujo, estado, fecha: null, tipo: null });
            } else if (fila.IcgSaldadoFecha) {
              reabiertos.push(fila.IdFlujo);
            }
          }
        }
      }
    } catch (e) {
      errores.push({ bd: g.info.dbName, mensaje: e.message });
    }
  }
  if (simular) {
    const antes = new Map(fl.recordset.map((x) => [x.IdFlujo, x.IcgEstado]));
    const nuevos = cambios.filter((c) => c.estado === 'S' && antes.get(c.idFlujo) !== 'S');
    return { enFlujo: fl.recordset.length, revisados, bds: porBd.size, saldadosNuevos: nuevos.length,
      actualizados: cambios.length - nuevos.length, errores, cambios, reabiertos };
  }
  const saldadosNuevos = await guardarCambios(cambios);
  return {
    enFlujo: fl.recordset.length, revisados, bds: porBd.size,
    saldadosNuevos, actualizados: cambios.length - saldadosNuevos,
    errores, reabiertos,
  };
}

// ── Fase 2: reabiertos en ICG ───────────────────────────────────────────────────────────
// Un gasto que el seguimiento vio saldado en ICG y que después volvió a quedar pendiente
// (el pago estaba mal y en ICG lo reabrieron). Queda a la vista sin consultar ICG:
// IcgEstado 'P' con la fecha del saldado anterior todavía guardada.
// Con SEGUIMIENTO_ICG_REABIERTOS=aplicar en el .env, en cada vuelta, a los que revisar() acaba
// de confirmar (pendientes en ICG dos vueltas seguidas, ver "reabiertos" en revisar):
//   - si estaba PAGADO o PAGO_EN_REVISION, vuelve a PENDIENTE_PAGO (Pagos carga el comprobante
//     correcto y Auditoría lo confirma) y el comprobante anterior queda anulado;
//   - en cualquier estado, se anota en el historial y se olvida el saldado anterior (si ICG lo
//     vuelve a saldar, se anota como un saldado nuevo).
// Si no, solo se simula: se listan en Admin → Seguimiento ICG sin cambiar nada.
const VUELVEN_A_PAGOS = ['PAGADO', 'PAGO_EN_REVISION'];
const modoReabiertos = () => (String(process.env.SEGUIMIENTO_ICG_REABIERTOS || '').trim().toLowerCase() === 'aplicar' ? 'aplicar' : 'simular');

async function listarReabiertos() {
  const app = await getPool();
  const r = await app.request().query(`
    SELECT IdFlujo, CodTienda, Marca, NumSerie, NumFactura, N, Estado, IcgSaldadoFecha, IcgTipoPago
    FROM dbo.GD_FacturaFlujo
    WHERE IcgEstado = 'P' AND IcgSaldadoFecha IS NOT NULL AND Estado NOT IN ('RECHAZADO', 'TRANSFERIDO')
      AND (Estado <> 'PAGADO' OR FechaActualizacion >= DATEADD(day, -${DIAS_PAGADOS}, GETDATE()))
    ORDER BY IcgSaldadoFecha DESC`);
  return r.recordset.map((x) => {
    const aPagos = VUELVEN_A_PAGOS.includes(x.Estado);
    return {
      idFlujo: x.IdFlujo, codTienda: x.CodTienda, marca: x.Marca,
      numserie: String(x.NumSerie).trim(), numfactura: x.NumFactura, n: String(x.N).trim(), estado: x.Estado,
      saldadoAntes: { fecha: x.IcgSaldadoFecha, tipo: x.IcgTipoPago },
      accion: aPagos ? 'A_PAGOS' : 'HISTORIAL',
      motivo: aPagos
        ? 'Vuelve a Pagos (Pendiente de Pago) para cargar el comprobante correcto; el comprobante anterior queda anulado.'
        : 'Sigue en su estado; solo se anota en el historial.',
    };
  });
}

// ids: los reabiertos que revisar() confirmó en esta vuelta. Todo o nada (transacción). La
// condición va en el mismo UPDATE, así que si un usuario lo movió mientras tanto se respeta.
async function aplicarReabiertos(ids) {
  const lista = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
  if (!lista.length) return { total: 0, aPagos: 0 };
  const app = await getPool();
  const r = await app.request().query(`
    SET NOCOUNT ON; SET XACT_ABORT ON;
    DECLARE @r TABLE (IdFlujo INT, Antes NVARCHAR(30), Fecha DATETIME, Tipo NVARCHAR(60));
    BEGIN TRAN;
    UPDATE f SET
      Estado = CASE WHEN f.Estado IN ('PAGADO', 'PAGO_EN_REVISION') THEN 'PENDIENTE_PAGO' ELSE f.Estado END,
      FechaActualizacion = CASE WHEN f.Estado IN ('PAGADO', 'PAGO_EN_REVISION') THEN GETDATE() ELSE f.FechaActualizacion END,
      IcgSaldadoFecha = NULL, IcgTipoPago = NULL
    OUTPUT inserted.IdFlujo, deleted.Estado, deleted.IcgSaldadoFecha, deleted.IcgTipoPago INTO @r
    FROM dbo.GD_FacturaFlujo f
    WHERE f.IdFlujo IN (${lista.join(',')})
      AND f.IcgEstado = 'P' AND f.IcgSaldadoFecha IS NOT NULL AND f.Estado NOT IN ('RECHAZADO', 'TRANSFERIDO');
    UPDATE a SET Anulado = 1, FechaAnulado = GETDATE()
    FROM dbo.GD_FacturaAdjunto a JOIN @r r ON r.IdFlujo = a.IdFlujo
    WHERE r.Antes IN ('PAGADO', 'PAGO_EN_REVISION') AND a.Tipo = 'COMPROBANTE' AND a.Anulado = 0;
    INSERT INTO dbo.GD_FacturaAprobacion (IdFlujo, Etapa, IdUsuario, Decision, Comentario)
    SELECT r.IdFlujo, 'SISTEMA', NULL, 'REABIERTO_ICG',
      N'Reabierto en ICG: estaba saldado el ' + CONVERT(varchar(10), r.Fecha, 103) + ISNULL(N' · ' + r.Tipo, N'')
      + N' y volvió a quedar pendiente.'
      + CASE WHEN r.Antes IN ('PAGADO', 'PAGO_EN_REVISION')
          THEN N' Vuelve a Pagos (estaba en ' + CASE r.Antes WHEN 'PAGADO' THEN N'Pagado' ELSE N'Pago en Revisión' END
            + N') para cargar el comprobante correcto; el comprobante anterior queda anulado.'
          ELSE N'' END
    FROM @r r;
    COMMIT TRAN;
    SELECT COUNT(*) AS total, ISNULL(SUM(CASE WHEN Antes IN ('PAGADO', 'PAGO_EN_REVISION') THEN 1 ELSE 0 END), 0) AS aPagos FROM @r;`);
  return r.recordset[0];
}

// ── Panel de Admin (Seguimiento ICG) ────────────────────────────────────────────────────
// Agrega tienda, zona, proveedor, fecha y total de ICG a filas { codTienda, numserie, numfactura, n }.
async function conDatosIcg(filas) {
  const { facturasPorClave } = require('./facturas.service');
  const { columnasLibres } = require('./facturasCompra.service');
  const infos = new Map();
  for (const cod of new Set(filas.map((x) => x.codTienda))) {
    try { infos.set(cod, await resolverTienda(cod)); } catch (e) { infos.set(cod, { error: true }); }
  }
  const porBd = new Map();
  for (const x of filas) {
    const info = infos.get(x.codTienda);
    if (info.error) continue;
    const bk = `${info.host}|${info.dbName}`;
    if (!porBd.has(bk)) porBd.set(bk, { info, claves: [] });
    porBd.get(bk).claves.push({ NumSerie: x.numserie, NumFactura: x.numfactura, N: x.n });
  }
  const datos = new Map();
  for (const [bk, g] of porBd) {
    try {
      const cols = await columnasLibres(g.info.pool, bk);
      for (const f of await facturasPorClave(g.info.pool, cols, g.claves)) datos.set(`${bk}|${clave(f.NUMSERIE, f.NUMFACTURA, f.N)}`, f);
    } catch (e) { /* sin datos de esa marca: la fila sale igual */ }
  }
  return filas.map((x) => {
    const info = infos.get(x.codTienda) || {};
    const f = info.error ? null : datos.get(`${info.host}|${info.dbName}|${clave(x.numserie, x.numfactura, x.n)}`);
    return {
      ...x, tienda: info.tienda ? info.tienda.Tienda : null, zona: info.tienda ? info.tienda.Zona : null,
      proveedor: f ? f.Proveedor : null, fecha: f ? f.FECHA : null, total: f ? f.TotalVes : null,
    };
  });
}

// Eventos automáticos ya aplicados (reabiertos y transferidos) de los últimos 30 días.
async function eventosRecientes() {
  const app = await getPool();
  const r = await app.request().query(`
    SELECT TOP 300 a.Decision, a.Comentario, a.Fecha, f.CodTienda, f.Marca, f.NumSerie, f.NumFactura, f.N, f.Estado
    FROM dbo.GD_FacturaAprobacion a JOIN dbo.GD_FacturaFlujo f ON f.IdFlujo = a.IdFlujo
    WHERE a.Etapa = 'SISTEMA' AND a.Decision IN ('REABIERTO_ICG', 'TRANSFERIDO', 'TRANSFERIDO_ICG')
      AND a.Fecha >= DATEADD(day, -30, GETDATE())
    ORDER BY a.Fecha DESC`);
  return r.recordset.map((x) => ({
    decision: x.Decision, comentario: x.Comentario, fecha: x.Fecha, codTienda: x.CodTienda, marca: x.Marca,
    numserie: String(x.NumSerie).trim(), numfactura: x.NumFactura, n: String(x.N).trim(), estado: x.Estado,
  }));
}

// Transferencias de mayores: la detección recorre todas las BD de marca, así que corre una vez
// por hora (y cuando Admin pide "Revisar ahora"); el último resultado queda para el panel.
const transferencias = { resultado: null, revisadoEn: null, revisando: false, error: null };
async function revisarTransferencias() {
  if (transferencias.revisando) return;
  transferencias.revisando = true;
  try {
    const traspasos = require('./traspasosMayores.service');
    const r = await traspasos.revisar();
    transferencias.resultado = r;
    transferencias.revisadoEn = new Date();
    transferencias.error = null;
    if (r.aplicado && (r.aplicado.transferidos || r.aplicado.etiquetados)) {
      console.log(`[seguimiento ICG] Transferencias de mayores: ${r.aplicado.transferidos} pasaron a Transferido, ${r.aplicado.etiquetados} con etiqueta.`);
    }
  } catch (e) {
    transferencias.error = e.message;
    console.error('[seguimiento ICG] Transferencias de mayores:', e.message);
  } finally { transferencias.revisando = false; }
}

async function estadoPanel() {
  const traspasos = require('./traspasosMayores.service');
  const r = transferencias.resultado;
  return {
    modos: { reabiertos: modoReabiertos(), transferidos: traspasos.modo() },
    reabiertos: await conDatosIcg(await listarReabiertos()),
    transferencias: r ? {
      casos: r.casos, resumen: r.resumen, errores: r.errores, segundos: r.segundos,
      transferirOmitido: r.transferirOmitido || 0, erroresAplicar: (r.aplicado && r.aplicado.errores) || [],
    } : null,
    transferenciasRevisadasEn: transferencias.revisadoEn,
    revisandoTransferencias: transferencias.revisando,
    errorTransferencias: transferencias.error,
    recientes: await eventosRecientes(),
  };
}

// Corre al minuto de arrancar y después cada INTERVALO; nunca dos a la vez. Un error que se
// repite se loguea una sola vez. Las transferencias de mayores, cada VUELTAS_TRANSFERENCIAS.
const VUELTAS_TRANSFERENCIAS = 6; // 6 × 10 min = 1 hora
let enCurso = false;
function iniciar() {
  let ultimoError = null;
  let vuelta = 0;
  const correr = async () => {
    if (enCurso) return;
    enCurso = true;
    const t0 = Date.now();
    try {
      const r = await revisar();
      if (r.saldadosNuevos) {
        console.log(`[seguimiento ICG] ${r.revisados} gasto(s) revisados en ${Math.round((Date.now() - t0) / 1000)} s: ${r.saldadosNuevos} saldado(s) en ICG nuevos.`);
      }
      const msj = r.errores.map((e) => `${e.bd}: ${e.mensaje}`).join(' | ');
      if (msj && msj !== ultimoError) console.error('[seguimiento ICG]', msj);
      ultimoError = msj || null;
      if (modoReabiertos() === 'aplicar' && r.reabiertos.length) {
        const ra = await aplicarReabiertos(r.reabiertos);
        if (ra.total) console.log(`[seguimiento ICG] ${ra.total} reabierto(s) en ICG; ${ra.aPagos} volvieron a Pagos.`);
      }
    } catch (e) {
      if (e.message !== ultimoError) console.error('[seguimiento ICG]', e.message);
      ultimoError = e.message;
    } finally { enCurso = false; }
    if (vuelta++ % VUELTAS_TRANSFERENCIAS === 0) await revisarTransferencias();
  };
  setTimeout(correr, 60 * 1000);
  setInterval(correr, INTERVALO_MS);
}

module.exports = { revisar, iniciar, listarReabiertos, aplicarReabiertos, estadoPanel, revisarTransferencias, modoReabiertos };
