import http from './http';

export const getContadores = () => http.get('/notificaciones/contadores').then((r) => r.data);

export const getDetalle = () => http.get('/notificaciones/detalle').then((r) => r.data);

export const limpiarAnalista = () => http.post('/notificaciones/limpiar-analista').then((r) => r.data);
