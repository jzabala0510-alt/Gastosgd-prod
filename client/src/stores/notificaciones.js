import { defineStore } from 'pinia';
import { getDetalle } from '../api/notificaciones';

// Pendientes por etapa, desglosados por tienda (para badges + panel "Tus pendientes").
export const useNotifStore = defineStore('notif', {
  state: () => ({ detalle: { tesoreria: [], auditoria: [], pagosRevision: [], pago: [], analista: [], devueltas: [], rechazadas: [] } }),
  getters: {
    tesoreria: (s) => s.detalle.tesoreria.reduce((a, x) => a + x.n, 0),
    auditoria: (s) => s.detalle.auditoria.reduce((a, x) => a + x.n, 0),
    pagosRevision: (s) => (s.detalle.pagosRevision || []).reduce((a, x) => a + x.n, 0),
    pago: (s) => s.detalle.pago.reduce((a, x) => a + x.n, 0),
    analista: (s) => (s.detalle.analista || []).reduce((a, x) => a + x.n, 0),
    devueltas: (s) => (s.detalle.devueltas || []).reduce((a, x) => a + x.n, 0),
    rechazadas: (s) => (s.detalle.rechazadas || []).reduce((a, x) => a + x.n, 0),
  },
  actions: {
    async refrescar() {
      try { this.detalle = await getDetalle(); } catch { /* silencioso: si falla, no rompe la barra */ }
    },
    reset() { this.detalle = { tesoreria: [], auditoria: [], pagosRevision: [], pago: [], analista: [], devueltas: [], rechazadas: [] }; },
  },
});
