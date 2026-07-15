import axios from 'axios';

// Instancia propia (no la de api/http.js): esta sección tiene su propia clave,
// independiente del login ICG, y no debe activar el interceptor de 401 que borra
// la sesión normal y redirige a /login.
const updaterHttp = axios.create({ baseURL: '/api/updater' });

updaterHttp.interceptors.request.use((config) => {
  const token = localStorage.getItem('gd_updater_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default updaterHttp;
