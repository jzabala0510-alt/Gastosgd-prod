import { defineStore } from 'pinia';
import http from '../api/http';
import { ROL_LABEL } from '../utils/roles';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('gd_token') || '',
    idUsuario: Number(localStorage.getItem('gd_idUsuario') || 0),
    usuario: localStorage.getItem('gd_usuario') || '',
    nombre: localStorage.getItem('gd_nombre') || '',
    roles: JSON.parse(localStorage.getItem('gd_roles') || '[]'),
    tiendas: JSON.parse(localStorage.getItem('gd_tiendas') || '[]'),
    zonas: JSON.parse(localStorage.getItem('gd_zonas') || '[]'),
  }),
  getters: {
    isAuth: (s) => !!s.token,
    rol: (s) => s.roles[0] || '',                                  // compat: primer rol
    rolLabel: (s) => (s.roles.length ? s.roles.map((r) => ROL_LABEL[r] || r).join(' · ') : '—'),
    esAdmin: (s) => s.roles.includes('ADMIN'),
    esAnalista: (s) => s.roles.includes('ANALISTA') || s.roles.includes('ADMIN'),
    esTesoreria: (s) => s.roles.includes('TESORERIA') || s.roles.includes('ADMIN'),
    esAuditor: (s) => s.roles.includes('AUDITOR') || s.roles.includes('ADMIN'),
    esPagador: (s) => s.roles.includes('PAGADOR') || s.roles.includes('ADMIN'),
    esPagadas: (s) => s.roles.includes('PAGADAS') || s.roles.includes('ADMIN'),
    esSaldos: (s) => s.roles.includes('SALDOS') || s.roles.includes('ADMIN'),
    esReportes: (s) => s.roles.includes('REPORTES') || s.roles.includes('ADMIN'),
    esPagosDevolver: (s) => s.roles.includes('PAGOS_DEVOLVER') || s.roles.includes('ADMIN'),
  },
  actions: {
    async login(password) {
      const { data } = await http.post('/auth/login', { password });
      const roles = data.roles || (data.rol ? [data.rol] : []);
      this.$patch({
        token: data.token, idUsuario: data.idUsuario, usuario: data.usuario,
        nombre: data.nombre, roles, tiendas: data.tiendas || [], zonas: data.zonas || [],
      });
      localStorage.setItem('gd_token', data.token);
      localStorage.setItem('gd_idUsuario', String(data.idUsuario || 0));
      localStorage.setItem('gd_usuario', data.usuario || '');
      localStorage.setItem('gd_nombre', data.nombre || '');
      localStorage.setItem('gd_roles', JSON.stringify(roles));
      localStorage.setItem('gd_tiendas', JSON.stringify(data.tiendas || []));
      localStorage.setItem('gd_zonas', JSON.stringify(data.zonas || []));
    },
    logout() {
      this.$patch({ token: '', idUsuario: 0, usuario: '', nombre: '', roles: [], tiendas: [], zonas: [] });
      ['gd_token', 'gd_idUsuario', 'gd_usuario', 'gd_nombre', 'gd_roles', 'gd_rol', 'gd_tiendas', 'gd_zonas'].forEach((k) => localStorage.removeItem(k));
    },
  },
});
