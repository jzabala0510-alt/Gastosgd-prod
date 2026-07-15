import http from './http';

export const getReporte = (params) => http.get('/reportes', { params }).then((r) => r.data);

export const getSaldos = (params) => http.get('/reportes/saldos', { params }).then((r) => r.data);
