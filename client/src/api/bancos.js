import http from './http';

// Catálogo público (bancos activos) — usado en Carga de Saldos.
export const getBancos = () => http.get('/catalogos/bancos').then((r) => r.data);

// Administración (ADMIN) — incluye inactivos.
export const getBancosAdmin = () => http.get('/admin/bancos').then((r) => r.data);
export const crearBanco = (nombre) => http.post('/admin/bancos', { nombre }).then((r) => r.data);
export const actualizarBanco = (id, payload) => http.put(`/admin/bancos/${id}`, payload).then((r) => r.data);
