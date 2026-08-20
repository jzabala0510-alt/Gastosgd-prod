import { defineStore } from 'pinia';

// Factory para Auditoría y Pagos (filtros de rango de fechas). Tesorería tiene su propio
// defineStore aparte (más abajo): necesita 2 campos extra para el selector múltiple de
// Marca/Tienda que no aplican a las demás vistas.
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

// Tesorería: además del selector Zona/Marca/Tienda de una sola tienda (igual al resto),
// admite un selector MÚLTIPLE opcional de Marca/Tienda (SelectorZMT con `multiple`) para
// consultar varias tiendas puntuales a la vez. marcasSel/tiendasSel son estado nuevo,
// exclusivo de esta vista. marca/codTienda siguen siendo escalares: los sigue usando el
// salto desde notificaciones y "Guardar fondos" (una corrección manual de disponibilidad
// es siempre de UNA tienda).
export const useTesoreriaStore = defineStore('vista-tesoreria', {
  state: () => ({
    zona: '',
    marca: '',
    codTienda: null,
    tiendas: [],
    autobuscar: false,
    filtros: { desde: '', hasta: '', proveedor: '', estado: '', tipoGasto: '' },
    seleccion: null,
    marcasSel: [],   // marcas marcadas en el selector múltiple (strings) — solo para poblar tiendasSel
    tiendasSel: [],  // tiendas marcadas en el selector múltiple — [{ CodTienda, Tienda, Marca }]
  }),
  actions: {
    limpiarFiltros() { this.filtros = { desde: '', hasta: '', proveedor: '', estado: '', tipoGasto: '' }; },
  },
});

export const useAuditoriaStore = crearVista('auditoria');
export const usePagosStore = crearVista('pagos');
export const usePagadasStore = crearVista('pagadas');
