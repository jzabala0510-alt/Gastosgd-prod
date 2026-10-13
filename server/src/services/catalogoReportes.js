const { rolesDe } = require('../middleware/auth.middleware');
const { ESTADOS_PENDIENTES } = require('./reportes.service');

// Reportes de Reportería: el sub-permiso de cada uno (bajo REPORTES) y los filtros
// que lo definen. Los filtros se arman aquí y no en el navegador, para que nadie
// pueda pedir otro reporte cambiando los parámetros de la petición.
// Mantener alineado con REPORTES_INFO en client/src/utils/roles.js.
const REPORTES = {
  // Gastos (general) = solo lo no procesado (pendiente por el analista).
  gastos: { tag: 'REP_GASTOS', filtros: { soloERP: true, estado: 'PENDIENTE_ANALISTA' } },
  // Sin soloERP: un gasto que ICG saldó a mitad del flujo sigue pendiente en la app.
  pendientes_solicitud: { tag: 'REP_SOLICITUD', filtros: { soloPendientes: true }, estadoOpcional: ESTADOS_PENDIENTES },
  pendiente_tesoreria: { tag: 'REP_TESORERIA', filtros: { estado: 'PENDIENTE_TESORERIA' } },
  pendiente_auditoria: { tag: 'REP_AUDITORIA', filtros: { estado: 'PENDIENTE_AUDITORIA' } },
  pendiente_pago: { tag: 'REP_PAGO', filtros: { estado: 'PENDIENTE_PAGO' } },
  aprobado: { tag: 'REP_PAGADO', filtros: { estado: 'PAGADO' } },
  devueltos: { tag: 'REP_DEVUELTOS', filtros: { estado: 'DEVUELTO' } },
  // Sin soloERP: un presupuesto ya pagado debe seguir apareciendo.
  presupuestos: { tag: 'REP_PRESUPUESTOS', filtros: { soloPresupuestos: true } },
  saldos: { tag: 'REP_SALDOS' },
};
const TAGS_REPORTE = Object.values(REPORTES).map((r) => r.tag);

// Solo claves propias: con REPORTES[tipo] a secas, "toString" o "constructor" (heredados
// de Object) pasaban como reporte válido y traían el listado completo sin filtros.
const esReporte = (tipo) => typeof tipo === 'string' && Object.prototype.hasOwnProperty.call(REPORTES, tipo);

// Reportes sin ningún sub-permiso marcado = todos los reportes (igual que "sin zonas =
// todas las zonas"); con alguno marcado, solo esos. ADMIN ve todos.
function puedeVerReporte(user, tipo) {
  if (!esReporte(tipo)) return false;
  const roles = rolesDe(user);
  if (roles.includes('ADMIN')) return true;
  if (!roles.includes('REPORTES')) return false;
  const marcados = roles.filter((r) => TAGS_REPORTE.includes(r));
  return !marcados.length || marcados.includes(REPORTES[tipo].tag);
}

// Filtros de listado() para un reporte: los fijos del tipo más lo que sí elige el
// usuario (zona, tienda, fechas y, solo en "Fecha de solicitud", una etapa pendiente).
function filtrosDeReporte(tipo, query) {
  const def = REPORTES[tipo];
  const filtros = {
    zona: query.zona || undefined,
    codTienda: query.codTienda ? Number(query.codTienda) : null,
    desde: query.desde || undefined,
    hasta: query.hasta || undefined,
    ...def.filtros,
  };
  if (def.estadoOpcional && def.estadoOpcional.includes(query.estado)) filtros.estado = query.estado;
  return filtros;
}

module.exports = { REPORTES, TAGS_REPORTE, esReporte, puedeVerReporte, filtrosDeReporte };
