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
export const ROLES_INFO = [
  { tag: 'ANALISTA', label: 'Gastos' },
  { tag: 'TESORERIA', label: 'Tesorería' },
  { tag: 'AUDITOR', label: 'Auditoría' },
  { tag: 'PAGADOR', label: 'Pagos' },
  { tag: 'PAGOS_DEVOLVER', label: 'Devolver en Pagos', shortLabel: 'Devolver', parent: 'PAGADOR' },
  { tag: 'PAGADAS', label: 'Pagadas' },
  { tag: 'SALDOS', label: 'Saldos' },
  { tag: 'REPORTES', label: 'Reportes' },
  { tag: 'ADMIN', label: 'Administrador' },
];

export const ROLES = ROLES_INFO.map((r) => r.tag);
export const ROL_LABEL = Object.fromEntries(ROLES_INFO.map((r) => [r.tag, r.label]));
