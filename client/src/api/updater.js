import updaterHttp from './updaterHttp';

export const loginUpdater = (clave) => updaterHttp.post('/login', { clave }).then((r) => r.data);
export const estadoUpdater = () => updaterHttp.get('/estado').then((r) => r.data);
export const actualizar = () => updaterHttp.post('/actualizar').then((r) => r.data);
