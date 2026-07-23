// Permisos por módulo (GD_Usuario.Rol, CSV). Un tag = un módulo, salvo ADMIN
// (paquete: Usuarios + Bancos + Actualizador, a propósito no se separa —
// evita que alguien sin ser admin pleno gestione permisos de otros).
// El label es el nombre del MÓDULO, no necesariamente igual al tag interno
// (ej. ANALISTA se muestra como "Gastos": quien aprueba gastos hacia
// Tesorería es justo quien debe ver esa bandeja).
export const ROLES = ['ANALISTA', 'TESORERIA', 'AUDITOR', 'PAGADOR', 'PAGADAS', 'SALDOS', 'REPORTES', 'PAGOS_DEVOLVER', 'ADMIN'];

export const ROL_LABEL = {
  ANALISTA: 'Gastos',
  TESORERIA: 'Tesorería',
  AUDITOR: 'Auditoría',
  PAGADOR: 'Pagos',
  PAGADAS: 'Pagadas',
  SALDOS: 'Saldos',
  REPORTES: 'Reportes',
  PAGOS_DEVOLVER: 'Devolver en Pagos',
  ADMIN: 'Administrador',
};
