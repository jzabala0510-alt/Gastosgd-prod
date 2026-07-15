import http from './http';

export const previewImport = (payload) =>
  http.post('/fondos/importar-excel/preview', payload).then((r) => r.data);
