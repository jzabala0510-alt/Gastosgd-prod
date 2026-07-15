import http from './http';

export const getFondosZona = (zona, fecha) =>
  http.get('/fondos/zona', { params: { zona, fecha } }).then((r) => r.data);

export const guardarFondos = (payload) =>
  http.post('/fondos/bulk', payload).then((r) => r.data);
