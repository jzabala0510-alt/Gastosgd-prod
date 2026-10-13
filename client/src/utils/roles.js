// Permisos por módulo (GD_Usuario.Rol, CSV). Un tag = un módulo, salvo ADMIN
// (paquete: Usuarios + Bancos + Actualizador, a propósito no se separa —
// evita que alguien sin ser admin pleno gestione permisos de otros).
// El label es el nombre del MÓDULO, no necesariamente igual al tag interno
// (ej. ANALISTA se muestra como "Gastos": quien aprueba gastos hacia
// Tesorería es justo quien debe ver esa bandeja).
//
// Algunos tags son "acción" en vez de "módulo": un permiso puntual dentro de
// un módulo que ya se habilita con otro rol (ej. PAGOS_DEVOLVER no da acceso
// a nada por sí solo, solo habilita el botón "Devolver" dentro de Pagos).
// `parent` marca ese caso para que la UI de Admin los agrupe/distinga.
// `grupo` es la sección del panel de permisos en Admin → Usuarios.

// Reportes de Reportería con su sub-permiso (bajo REPORTES). Reportes sin ningún
// reporte marcado = ve todos (como "sin zonas = todas las zonas").
// Mantener alineado con server/src/services/catalogoReportes.js.
export const REPORTES_INFO = [
  { tipo: 'gastos', tag: 'REP_GASTOS', label: 'Gastos (general)' },
  { tipo: 'pendientes_solicitud', tag: 'REP_SOLICITUD', label: 'Gastos (Fecha de solicitud)' },
  { tipo: 'pendiente_tesoreria', tag: 'REP_TESORERIA', label: 'Pendiente por aprobar Tesorería' },
  { tipo: 'pendiente_auditoria', tag: 'REP_AUDITORIA', label: 'Pendiente por Auditoría' },
  { tipo: 'pendiente_pago', tag: 'REP_PAGO', label: 'Pendientes por pagar' },
  { tipo: 'aprobado', tag: 'REP_PAGADO', label: 'Aprobado (pagado)' },
  { tipo: 'devueltos', tag: 'REP_DEVUELTOS', label: 'Devueltos' },
  { tipo: 'presupuestos', tag: 'REP_PRESUPUESTOS', label: 'Presupuestos' },
  { tipo: 'saldos', tag: 'REP_SALDOS', label: 'General de saldos' },
];
export const TAGS_REPORTE = REPORTES_INFO.map((r) => r.tag);

export const ROLES_INFO = [
  { tag: 'ANALISTA', label: 'Gastos', grupo: 'Operación' },
  { tag: 'TESORERIA', label: 'Tesorería', grupo: 'Operación' },
  { tag: 'AUDITOR', label: 'Auditoría', grupo: 'Operación' },
  { tag: 'PAGADOR', label: 'Pagos', grupo: 'Operación' },
  { tag: 'PAGOS_DEVOLVER', label: 'Devolver en Pagos', shortLabel: 'Devolver', parent: 'PAGADOR' },
  { tag: 'PAGADAS', label: 'Pagadas', grupo: 'Consulta' },
  { tag: 'SALDOS', label: 'Saldos', grupo: 'Consulta' },
  { tag: 'ARCHIVO', label: 'Archivo', grupo: 'Consulta' },
  { tag: 'REPORTES', label: 'Reportes', grupo: 'Reportes' },
  ...REPORTES_INFO.map((r) => ({ tag: r.tag, label: `Reporte: ${r.label}`, shortLabel: r.label, parent: 'REPORTES' })),
  { tag: 'ADMIN', label: 'Administrador', grupo: 'Administración' },
];

export const GRUPOS_PERMISOS = ['Operación', 'Consulta', 'Reportes', 'Administración'];
export const ROLES = ROLES_INFO.map((r) => r.tag);
export const ROL_LABEL = Object.fromEntries(ROLES_INFO.map((r) => [r.tag, r.label]));
