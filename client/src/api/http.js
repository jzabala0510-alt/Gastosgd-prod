import axios from 'axios';

const http = axios.create({ baseURL: '/api' });

// Adjunta el token en cada peticion
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('gd_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el token expira/invalida (401), limpia sesion y manda al login.
// (No redirige en el propio login para no romper el mensaje de credenciales.)
http.interceptors.response.use(
  (res) => res,
  (error) => {
    const url = error.config?.url || '';
    if (error.response?.status === 401 && !url.includes('/auth/login')) {
      ['gd_token', 'gd_usuario', 'gd_nombre', 'gd_roles', 'gd_rol', 'gd_tiendas'].forEach((k) => localStorage.removeItem(k));
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default http;
