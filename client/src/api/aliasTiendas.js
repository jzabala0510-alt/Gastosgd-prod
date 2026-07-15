import http from './http';

export const sugerirAlias = (filas) => http.post('/admin/alias-tiendas/sugerir', { filas }).then((r) => r.data);
export const confirmarAlias = (decisiones) => http.post('/admin/alias-tiendas/confirmar', { decisiones }).then((r) => r.data);
export const getAliasConfirmados = () => http.get('/admin/alias-tiendas').then((r) => r.data);
export const getTiendasErp = () => http.get('/admin/alias-tiendas/tiendas-erp').then((r) => r.data);
export const actualizarAlias = (id, payload) => http.put(`/admin/alias-tiendas/${id}`, payload).then((r) => r.data);
