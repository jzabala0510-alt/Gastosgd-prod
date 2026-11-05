import http from './http';

// moneda: 'BS' (por defecto) o 'USD'.
export const getFondosZona = (zona, fecha, moneda = 'BS') =>
  http.get('/fondos/zona', { params: { zona, fecha, moneda } }).then((r) => r.data);

export const guardarFondos = (payload) =>
  http.post('/fondos/bulk', payload).then((r) => r.data);

export const getBanescoEstado = (zona) =>
  http.get('/fondos/banesco', { params: { zona } }).then((r) => r.data);

export const sincronizarBanesco = (zona, moneda = 'BS') =>
  http.post('/fondos/banesco', { zona, moneda }).then((r) => r.data);

// Consola Banesco (solo ADMIN)
export const getConsolaBanesco = () =>
  http.get('/fondos/banesco/consola').then((r) => r.data);

export const probarBanesco = (indice, monedas) =>
  http.post('/fondos/banesco/consola/probar', { indice, monedas }).then((r) => r.data);

export const limpiarConsolaBanesco = () =>
  http.delete('/fondos/banesco/consola').then((r) => r.data);
