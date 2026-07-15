import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useNotifStore } from '../stores/notificaciones';
import { useGastosStore, useTesoreriaStore, useAuditoriaStore, usePagosStore } from '../stores/vistas';
import { limpiarAnalista } from '../api/notificaciones';

// Lógica compartida de notificaciones: secciones por rol, total y navegación.
// La usan la campana (resumen) y la vista /notificaciones (detallada).
export function useNotificaciones() {
  const auth = useAuthStore();
  const notif = useNotifStore();
  const router = useRouter();

  const gastos = useGastosStore();
  const tesoreria = useTesoreriaStore();
  const auditoria = useAuditoriaStore();
  const pagos = usePagosStore();

  const secciones = computed(() => {
    const out = [];
    const add = (cond, tipo, titulo, items, ruta, store, clase) => {
      const arr = items || [];
      if (cond && arr.length) out.push({ tipo, titulo, items: arr, ruta, store, clase, n: arr.reduce((a, x) => a + x.n, 0) });
    };
    add(auth.esAnalista, 'devueltas', 'Devueltas para corregir', notif.detalle.devueltas, '/gastos', gastos, 'badge--red');
    add(auth.esAnalista, 'rechazadas', 'Rechazadas', notif.detalle.rechazadas, '/gastos', gastos, 'badge--red');
    add(auth.esAnalista, 'analista', 'Gastos pagados', notif.detalle.analista, '/gastos', gastos, 'badge--green');
    add(auth.esTesoreria, 'tesoreria', 'Tesorería', notif.detalle.tesoreria, '/tesoreria', tesoreria, 'badge--amber');
    add(auth.esAuditor, 'auditoria', 'Auditoría', notif.detalle.auditoria, '/auditoria', auditoria, 'badge--blue');
    add(auth.esAuditor, 'pagosRevision', 'Comprobantes por confirmar', notif.detalle.pagosRevision, '/auditoria', auditoria, 'badge--amber');
    add(auth.esPagador, 'pago', 'Pagos', notif.detalle.pago, '/pagos', pagos, 'badge--amber');
    return out;
  });
  const total = computed(() => secciones.value.reduce((a, s) => a + s.n, 0));

  function irA(s, it) {
    // autobuscar=true → el SelectorZMT de la vista destino ejecuta la búsqueda
    // (sirve igual si ya estás en la vista o si navegas a ella).
    s.store.$patch({ zona: it.zona, marca: it.marca, codTienda: it.codTienda, autobuscar: true });
    if (router.currentRoute.value.path !== s.ruta) router.push(s.ruta);
  }

  async function limpiarNotifAnalista() {
    await limpiarAnalista();
    notif.refrescar();
  }

  return { secciones, total, irA, limpiarNotifAnalista };
}
