import http from './http';

export const getUsuarios = () => http.get('/admin/usuarios').then((r) => r.data);
export const setUsuario = (cod, payload) => http.put(`/admin/usuarios/${cod}`, payload).then((r) => r.data);
export const setUsuarioZonas = (cod, zonas) => http.put(`/admin/usuarios/${cod}/zonas`, { zonas }).then((r) => r.data);
export const getSeguimientoIcg = () => http.get('/admin/seguimiento-icg').then((r) => r.data);
// Recorre todas las BD de marca: puede tardar un par de minutos.
export const revisarTransferencias = () => http.post('/admin/seguimiento-icg/revisar', null, { timeout: 10 * 60 * 1000 }).then((r) => r.data);
