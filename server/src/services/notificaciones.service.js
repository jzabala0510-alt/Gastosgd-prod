const { getPool } = require('../config/db');

// Conteos simples sobre GD_FacturaFlujo (etapas con bandeja explícita).
async function contadores() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT Estado, CodTienda, COUNT(*) AS n
    FROM dbo.GD_FacturaFlujo
    WHERE Estado IN ('PENDIENTE_TESORERIA','PENDIENTE_AUDITORIA','PENDIENTE_PAGO','PAGO_EN_REVISION')
    GROUP BY Estado, CodTienda`);
  return r.recordset;
}

// Pendientes desglosados por tienda (zona/marca/tienda + conteo), según los
// roles del usuario:
//   TESORERIA→tesoreria · AUDITOR→auditoria+pagosRevision · PAGADOR→pago
//   ANALISTA→analista (PAGADO sin ver) + devueltas (DEVUELTO, tarea) + rechazadas (RECHAZADO sin ver).
async function detalle(roles) {
  const esAdmin = roles.includes('ADMIN');
  const pend = [];
  if (esAdmin || roles.includes('TESORERIA')) pend.push('PENDIENTE_TESORERIA');
  if (esAdmin || roles.includes('AUDITOR')) pend.push('PENDIENTE_AUDITORIA', 'PAGO_EN_REVISION');
  if (esAdmin || roles.includes('PAGADOR')) pend.push('PENDIENTE_PAGO');
  const verAnalista = esAdmin || roles.includes('ANALISTA');
  if (!pend.length && !verAnalista) return []; // sin roles operativos: nada que notificar

  const partes = [];
  if (pend.length) {
    partes.push(`SELECT Estado, CodTienda, COUNT(*) AS n FROM dbo.GD_FacturaFlujo
      WHERE Estado IN (${pend.map((s) => `'${s}'`).join(',')}) GROUP BY Estado, CodTienda`);
  }
  if (verAnalista) {
    // PAGADO sin ver (informativo) + DEVUELTO (tarea por corregir) + RECHAZADO sin ver (informativo).
    partes.push(`SELECT Estado, CodTienda, COUNT(*) AS n FROM dbo.GD_FacturaFlujo
      WHERE Estado = 'PAGADO' AND VistoPorAnalista = 0 GROUP BY Estado, CodTienda`);
    partes.push(`SELECT Estado, CodTienda, COUNT(*) AS n FROM dbo.GD_FacturaFlujo
      WHERE Estado = 'DEVUELTO' GROUP BY Estado, CodTienda`);
    partes.push(`SELECT Estado, CodTienda, COUNT(*) AS n FROM dbo.GD_FacturaFlujo
      WHERE Estado = 'RECHAZADO' AND VistoPorAnalista = 0 GROUP BY Estado, CodTienda`);
  }

  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT g.Estado, g.CodTienda, g.n, ec.zona, ec.tienda, ec.marca
    FROM ( ${partes.join(' UNION ALL ')} ) g
    OUTER APPLY (
      SELECT TOP 1 LTRIM(RTRIM(PROVINCIA)) AS zona, LTRIM(RTRIM(DESCRIPCION)) AS tienda, LTRIM(RTRIM(DIRECCION)) AS marca
      FROM GENERAL.dbo.EMPRESASCONTABLES WHERE CODIGO = g.CodTienda
    ) ec
    ORDER BY ec.zona, ec.tienda`);
  return r.recordset;
}

// Marca como vistas las PAGADO y RECHAZADO (los avisos informativos del analista).
// Las DEVUELTO no se limpian: son tareas que desaparecen solas cuando el analista las reenvía.
async function limpiarAnalista() {
  const pool = await getPool();
  await pool.request()
    .query(`UPDATE dbo.GD_FacturaFlujo SET VistoPorAnalista = 1 WHERE Estado IN ('PAGADO','RECHAZADO') AND VistoPorAnalista = 0`);
}

module.exports = { contadores, detalle, limpiarAnalista };
