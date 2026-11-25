const { sql, getPool } = require('../config/db');
const { codTiendasDeZonas } = require('./alcance');
const { tiendaInfo } = require('./marca');

// Auditoría de usuarios: qué hizo un usuario en un rango de fechas.
//   - Movimientos: sus decisiones en el flujo (historial GD_FacturaAprobacion), los soportes que
//     subió (GD_FacturaAdjunto.IdUsuario, registrado desde nov-2026) y los saldos que cargó
//     (GD_DispTienda) y los ajustes de Tesorería (GD_DispAjuste).
//   - Bandejas: para cada módulo del usuario (Tesorería, Auditoría, Confirmación de pago, Pagos),
//     cuántos gastos le entraron en el rango (en sus zonas), cuántos trabajó él y quién trabajó
//     el resto. "Entró" = la acción que lo dejó en esa bandeja; "trabajó" = la primera acción en
//     esa etapa después de entrar.

// Qué deja un gasto en cada bandeja (etapa/decisión del historial) y qué etapa lo trabaja.
const BANDEJAS = [
  { clave: 'TESORERIA', nombre: 'Tesorería', rol: 'TESORERIA', etapa: 'TESORERIA',
    entra: [['ANALISTA', 'APROBADO']] },
  { clave: 'AUDITORIA', nombre: 'Auditoría', rol: 'AUDITOR', etapa: 'AUDITORIA',
    entra: [['TESORERIA', 'APROBADO'], ['PAGADOR', 'DEVUELTO']] },
  { clave: 'CONFIRMACION', nombre: 'Confirmación de pago', rol: 'AUDITOR', etapa: 'AUDITOR_PAGO',
    entra: [['PAGADOR', 'PAGO_EN_REVISION']] },
  { clave: 'PAGOS', nombre: 'Pagos', rol: 'PAGADOR', etapa: 'PAGADOR',
    entra: [['AUDITORIA', 'APROBADO'], ['AUDITOR_PAGO', 'DEVUELTO']] },
];

const ETAPA_TXT = { ANALISTA: 'Gastos', TESORERIA: 'Tesorería', AUDITORIA: 'Auditoría', PAGADOR: 'Pagos', AUDITOR_PAGO: 'Confirmación de pago', SISTEMA: 'Sistema' };
const DECISION_TXT = {
  APROBADO: 'Aprobó', DEVUELTO: 'Devolvió', RECHAZADO: 'Rechazó', PAGO_EN_REVISION: 'Registró el pago', CONFIRMADO: 'Confirmó el pago',
};

// Usuarios con acceso a la app (para el selector).
async function usuarios() {
  const app = await getPool();
  const r = await app.request().query(`SELECT IdUsuario, Nombre, Rol FROM dbo.GD_Usuario WHERE Activo = 1 ORDER BY Nombre`);
  return r.recordset.map((u) => ({ idUsuario: u.IdUsuario, nombre: u.Nombre, roles: String(u.Rol || '').split(',').map((s) => s.trim()).filter(Boolean) }));
}

// Nombre de tienda cacheado (para movimientos de saldos).
const nombresTienda = new Map();
async function nombreTienda(cod) {
  if (!nombresTienda.has(cod)) {
    let t = null;
    try { t = await tiendaInfo(cod); } catch { /* sin GENERAL */ }
    nombresTienda.set(cod, t ? { tienda: t.Tienda, marca: t.Marca, zona: t.Zona } : { tienda: `Tienda ${cod}` });
  }
  return nombresTienda.get(cod);
}

async function consultar({ idUsuario, desde, hasta }) {
  const app = await getPool();
  const u = await app.request().input('id', sql.Int, idUsuario)
    .query('SELECT IdUsuario, Nombre, Rol FROM dbo.GD_Usuario WHERE IdUsuario = @id');
  if (!u.recordset.length) return { error: 'Usuario no encontrado', status: 404 };
  const usuario = u.recordset[0];
  const roles = String(usuario.Rol || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Rango [desde 00:00, hasta+1 00:00) en hora local (los DATETIME de la app son hora de Venezuela).
  const rq = () => app.request().input('id', sql.Int, idUsuario).input('d', sql.Date, desde).input('h', sql.Date, hasta);

  // 1) Decisiones en el flujo.
  const dec = await rq().query(`
    SELECT a.Fecha, a.Etapa, a.Decision, a.Comentario, f.IdFlujo, f.CodTienda, f.Marca, f.NumSerie, f.NumFactura, f.N, f.Estado
    FROM dbo.GD_FacturaAprobacion a JOIN dbo.GD_FacturaFlujo f ON f.IdFlujo = a.IdFlujo
    WHERE a.IdUsuario = @id AND a.Fecha >= @d AND a.Fecha < DATEADD(day, 1, CAST(@h AS DATETIME))`);
  // 2) Soportes subidos (solo los registrados con usuario).
  const adj = await rq().query(`
    SELECT ad.FechaSubida AS Fecha, ad.Tipo, ad.NombreOriginal, f.IdFlujo, f.CodTienda, f.Marca, f.NumSerie, f.NumFactura, f.N, f.Estado
    FROM dbo.GD_FacturaAdjunto ad JOIN dbo.GD_FacturaFlujo f ON f.IdFlujo = ad.IdFlujo
    WHERE ad.IdUsuario = @id AND ad.FechaSubida >= @d AND ad.FechaSubida < DATEADD(day, 1, CAST(@h AS DATETIME))`);
  // 3) Saldos cargados (por tienda y día de saldo) y ajustes de Tesorería.
  const sal = await rq().query(`
    SELECT MAX(FechaRegistro) AS Fecha, CodTienda, Fecha AS FechaSaldo, CodMoneda, COUNT(*) AS Bancos, SUM(MontoDisponible) AS Total
    FROM dbo.GD_DispTienda
    WHERE IdUsuario = @id AND FechaRegistro >= @d AND FechaRegistro < DATEADD(day, 1, CAST(@h AS DATETIME))
    GROUP BY CodTienda, Fecha, CodMoneda`);
  const aju = await rq().query(`
    SELECT FechaRegistro AS Fecha, CodTienda, Fecha AS FechaSaldo, MontoAjuste
    FROM dbo.GD_DispAjuste
    WHERE IdUsuario = @id AND FechaRegistro >= @d AND FechaRegistro < DATEADD(day, 1, CAST(@h AS DATETIME))`);

  const factura = (x) => ({ idFlujo: x.IdFlujo, codTienda: x.CodTienda, marca: x.Marca, numserie: String(x.NumSerie).trim(), numfactura: x.NumFactura, n: String(x.N).trim(), estadoActual: x.Estado });
  const movimientos = [
    ...dec.recordset.map((x) => ({ fecha: x.Fecha, tipo: 'DECISION', modulo: ETAPA_TXT[x.Etapa] || x.Etapa, etapa: x.Etapa, decision: x.Decision,
      accion: DECISION_TXT[x.Decision] || x.Decision, comentario: x.Comentario, ...factura(x) })),
    ...adj.recordset.map((x) => ({ fecha: x.Fecha, tipo: 'SOPORTE', modulo: 'Soportes', accion: `Subió ${String(x.Tipo || 'soporte').toLowerCase()}`,
      comentario: x.NombreOriginal, ...factura(x) })),
  ];
  for (const x of sal.recordset) {
    const t = await nombreTienda(x.CodTienda);
    movimientos.push({ fecha: x.Fecha, tipo: 'SALDO', modulo: 'Saldos', accion: `Cargó saldos ${x.CodMoneda === 2 ? 'en $' : 'en Bs'}`,
      comentario: `Saldo del ${String(x.FechaSaldo.toISOString()).slice(0, 10).split('-').reverse().join('/')}: ${x.Bancos} banco(s), total ${Number(x.Total).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      codTienda: x.CodTienda, tienda: t.tienda, marca: t.marca });
  }
  for (const x of aju.recordset) {
    const t = await nombreTienda(x.CodTienda);
    movimientos.push({ fecha: x.Fecha, tipo: 'AJUSTE', modulo: 'Tesorería', accion: 'Ajustó el disponible',
      comentario: `Disponible del ${String(x.FechaSaldo.toISOString()).slice(0, 10).split('-').reverse().join('/')}: ajuste ${Number(x.MontoAjuste).toLocaleString('es-VE', { minimumFractionDigits: 2 })}`,
      codTienda: x.CodTienda, tienda: t.tienda, marca: t.marca });
  }
  // Tienda, proveedor y monto de cada factura (una consulta por BD de marca).
  const { conDatosIcg } = require('./seguimientoIcg.service');
  const unicas = [...new Map(movimientos.filter((m) => m.idFlujo).map((m) => [m.idFlujo, m])).values()];
  const datos = new Map((await conDatosIcg(unicas.map((m) => ({ idFlujo: m.idFlujo, codTienda: m.codTienda, numserie: m.numserie, numfactura: m.numfactura, n: m.n }))))
    .map((x) => [x.idFlujo, x]));
  for (const m of movimientos) {
    const x = m.idFlujo && datos.get(m.idFlujo);
    if (x) Object.assign(m, { tienda: x.tienda, zona: x.zona, proveedor: x.proveedor, total: x.total });
  }
  movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // 4) Bandejas del usuario: entraron (en sus zonas) / trabajó él / trabajaron otros / sin trabajar.
  const amb = await app.request().input('id', sql.Int, idUsuario)
    .query("SELECT LTRIM(RTRIM(Zona)) AS Zona FROM dbo.GD_UsuarioAmbito WHERE IdUsuario = @id AND ISNULL(LTRIM(RTRIM(Zona)), '') <> ''");
  const zonas = amb.recordset.map((x) => x.Zona);
  const esAdmin = roles.includes('ADMIN');
  const codTiendas = (!esAdmin && zonas.length) ? await codTiendasDeZonas(zonas) : null;
  const bandejas = [];
  for (const b of BANDEJAS.filter((x) => esAdmin || roles.includes(x.rol))) {
    const cond = b.entra.map(([e, dd]) => `(a.Etapa = '${e}' AND a.Decision = '${dd}')`).join(' OR ');
    const r = await app.request().input('d', sql.Date, desde).input('h', sql.Date, hasta).query(`
      WITH E AS (
        SELECT a.IdFlujo, f.CodTienda, MIN(a.Fecha) AS Entro
        FROM dbo.GD_FacturaAprobacion a JOIN dbo.GD_FacturaFlujo f ON f.IdFlujo = a.IdFlujo
        WHERE (${cond}) AND a.Fecha >= @d AND a.Fecha < DATEADD(day, 1, CAST(@h AS DATETIME))
        GROUP BY a.IdFlujo, f.CodTienda
      )
      SELECT E.IdFlujo, E.CodTienda, w.IdUsuario, ISNULL(us.Nombre, N'') AS Nombre
      FROM E
        OUTER APPLY (SELECT TOP 1 a2.IdUsuario FROM dbo.GD_FacturaAprobacion a2
                     WHERE a2.IdFlujo = E.IdFlujo AND a2.Etapa = '${b.etapa}' AND a2.Fecha >= E.Entro ORDER BY a2.Fecha) w
        LEFT JOIN dbo.GD_Usuario us ON us.IdUsuario = w.IdUsuario`);
    const filas = codTiendas ? r.recordset.filter((x) => codTiendas.has(x.CodTienda)) : r.recordset;
    const porUsuario = new Map();
    let suyos = 0; let sinTrabajar = 0;
    for (const x of filas) {
      if (x.IdUsuario == null) { sinTrabajar++; continue; }
      if (x.IdUsuario === idUsuario) { suyos++; continue; }
      porUsuario.set(x.Nombre, (porUsuario.get(x.Nombre) || 0) + 1);
    }
    bandejas.push({
      clave: b.clave, nombre: b.nombre, entraron: filas.length, trabajo: suyos, sinTrabajar,
      otros: [...porUsuario.entries()].map(([nombre, n]) => ({ nombre, n })).sort((a, c) => c.n - a.n),
    });
  }

  // 5) Resumen por acción.
  const porAccion = {};
  for (const m of movimientos) {
    const k = `${m.modulo} · ${m.accion}`;
    porAccion[k] = (porAccion[k] || 0) + 1;
  }
  return {
    usuario: { idUsuario: usuario.IdUsuario, nombre: usuario.Nombre, roles, zonas },
    desde, hasta, movimientos, bandejas,
    resumen: Object.entries(porAccion).map(([accion, n]) => ({ accion, n })).sort((a, b) => b.n - a.n),
    gastosTrabajados: new Set(movimientos.filter((m) => m.idFlujo).map((m) => m.idFlujo)).size,
  };
}

module.exports = { usuarios, consultar, BANDEJAS };
