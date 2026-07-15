import http from './http';

export const getUsuarios = () => http.get('/admin/usuarios').then((r) => r.data);
export const setUsuario = (cod, payload) => http.put(`/admin/usuarios/${cod}`, payload).then((r) => r.data);
export const setUsuarioZonas = (cod, zonas) => http.put(`/admin/usuarios/${cod}/zonas`, { zonas }).then((r) => r.data);
