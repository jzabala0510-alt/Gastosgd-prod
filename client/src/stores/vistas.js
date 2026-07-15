import { defineStore } from 'pinia';

// Factory para Tesorería, Auditoría y Pagos (filtros de rango de fechas).
function crearVista(id) {
  return defineStore(`vista-${id}`, {
    state: () => ({
      zona: '',
      marca: '',
      codTienda: null,
      tiendas: [],       // lista de tiendas del scope actual (zona+marca); escrita por SelectorZMT
      autobuscar: false, // bandera: el SelectorZMT ejecuta la búsqueda al saltar desde notificaciones
      filtros: { desde: '', hasta: '', proveedor: '', estado: '', tipoGasto: '' },
      seleccion: null,
    }),
    actions: {
      limpiarFiltros() { this.filtros = { desde: '', hasta: '', proveedor: '', estado: '', tipoGasto: '' }; },
    },
  });
}

// Gastos usa fechas exactas (Fecha de factura y Fecha de solicitud), no rangos.
export const useGastosStore = defineStore('vista-gastos', {
  state: () => ({
    zona: '',
    marca: '',
    codTienda: null,
    tiendas: [],       // lista de tiendas del scope actual (zona+marca); escrita por SelectorZMT
    autobuscar: false, // bandera: el SelectorZMT ejecuta la búsqueda al saltar desde notificaciones
    filtros: { fecha: '', fechaSolicitud: '', proveedor: '', estado: '', tipoGasto: '' },
    seleccion: null,
  }),
  actions: {
    limpiarFiltros() { this.filtros = { fecha: '', fechaSolicitud: '', proveedor: '', estado: '', tipoGasto: '' }; },
  },
});

export const useTesoreriaStore = crearVista('tesoreria');
export const useAuditoriaStore = crearVista('auditoria');
export const usePagosStore = crearVista('pagos');
export const usePagadasStore = crearVista('pagadas');
