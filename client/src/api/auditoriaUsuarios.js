import http from './http';

export const getUsuariosAuditables = () => http.get('/auditoria-usuarios/usuarios').then((r) => r.data);
export const getActividad = (params) => http.get('/auditoria-usuarios', { params }).then((r) => r.data);
