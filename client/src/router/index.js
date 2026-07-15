import { createRouter, createWebHistory } from 'vue-router';
import Home from '../views/Home.vue';
import Login from '../views/Login.vue';
import Gastos from '../views/Gastos.vue';
import FacturaDetalle from '../views/FacturaDetalle.vue';
import Tesoreria from '../views/Tesoreria.vue';
import Auditoria from '../views/Auditoria.vue';
import Pagos from '../views/Pagos.vue';
import Pagadas from '../views/Pagadas.vue';
import AdminUsuarios from '../views/AdminUsuarios.vue';
import AdminBancos from '../views/AdminBancos.vue';
import AdminAliasTiendas from '../views/AdminAliasTiendas.vue';
import CargaMontos from '../views/CargaMontos.vue';
import ImportarSaldos from '../views/ImportarSaldos.vue';
import Reportes from '../views/Reportes.vue';
import Notificaciones from '../views/Notificaciones.vue';
import Actualizador from '../views/Actualizador.vue';

const routes = [
  { path: '/login', name: 'login', component: Login, meta: { public: true } },
  { path: '/actualizador', name: 'actualizador', component: Actualizador, meta: { public: true } },
  { path: '/', name: 'home', component: Home },
  { path: '/gastos', name: 'gastos', component: Gastos },
  { path: '/factura/:codTienda/:numserie/:numfactura/:n', name: 'factura', component: FacturaDetalle, props: true },
  { path: '/tesoreria', name: 'tesoreria', component: Tesoreria },
  { path: '/auditoria', name: 'auditoria', component: Auditoria },
  { path: '/pagos', name: 'pagos', component: Pagos },
  { path: '/pagadas', name: 'pagadas', component: Pagadas },
  { path: '/fondos', name: 'fondos', component: CargaMontos },
  { path: '/fondos/importar', name: 'importar-saldos', component: ImportarSaldos },
  { path: '/reportes', name: 'reportes', component: Reportes },
  { path: '/notificaciones', name: 'notificaciones', component: Notificaciones },
  { path: '/admin/usuarios', name: 'admin-usuarios', component: AdminUsuarios, meta: { admin: true } },
  { path: '/admin/bancos', name: 'admin-bancos', component: AdminBancos, meta: { admin: true } },
  { path: '/admin/alias-tiendas', name: 'admin-alias-tiendas', component: AdminAliasTiendas, meta: { admin: true } },
];

const router = createRouter({ history: createWebHistory(), routes });

router.beforeEach((to) => {
  const token = localStorage.getItem('gd_token');
  if (!to.meta.public && !token) return { name: 'login' };
  if (to.name === 'login' && token) return { name: 'home' };
  if (to.meta.admin && !JSON.parse(localStorage.getItem('gd_roles') || '[]').includes('ADMIN')) return { name: 'home' };
  return true;
});

export default router;
