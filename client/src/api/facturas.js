import http from './http';

// Jerarquía
export const getZonas = () => http.get('/jerarquia/zonas').then((r) => r.data);
export const getMarcas = (zona) => http.get('/jerarquia/marcas', { params: zona ? { zona } : {} }).then((r) => r.data);
export const getTiendas = (zona, marca) =>
  http.get('/jerarquia/tiendas', { params: { ...(zona ? { zona } : {}), ...(marca ? { marca } : {}) } }).then((r) => r.data);

// Facturas (gastos)
export const getFacturas = (codTienda, estado) =>
  http.get('/facturas', { params: { codTienda, ...(estado ? { estado } : {}) } }).then((r) => r.data);
export const getFacturaDetalle = (codTienda, numserie, numfactura, n) =>
  http.get('/facturas/detalle', { params: { codTienda, numserie, numfactura, n } }).then((r) => r.data);
export const getBandeja = (estado) => http.get('/facturas/bandeja', { params: { estado } }).then((r) => r.data);

// Fondos / cobertura
export const getCobertura = (codTienda, fecha) =>
  http.get('/facturas/cobertura', { params: { codTienda, ...(fecha ? { fecha } : {}) } }).then((r) => r.data);
export const setDisponibilidad = (data) => http.post('/facturas/disponibilidad', data).then((r) => r.data);

// Acciones de flujo
export const accionAnalista = (payload) => http.post('/facturas/analista', payload).then((r) => r.data);
export const accionTesoreria = (payload) => http.post('/facturas/tesoreria', payload).then((r) => r.data);
export const accionAuditoria = (payload) => http.post('/facturas/auditoria', payload).then((r) => r.data);
export const accionPagoDevolver = (payload) => http.post('/facturas/pagos-devolver', payload).then((r) => r.data);

// Soportes
export const uploadAdjuntos = (formData) => http.post('/facturas/adjuntos', formData).then((r) => r.data);
export const deleteAdjunto = (id) => http.delete(`/facturas/adjuntos/${id}`).then((r) => r.data);

// Pago (PAGADOR: comprobante obligatorio + cambia estado a PAGO_EN_REVISION)
export const pagarFactura = (formData) => http.post('/facturas/pagar', formData).then((r) => r.data);

// Confirmación de pago (AUDITOR: PAGO_EN_REVISION → PAGADO o PENDIENTE_PAGO)
export const confirmarPago = (payload) => http.post('/facturas/confirmar-pago', payload).then((r) => r.data);

// Facturas PAGADAS recientes para una tienda (notificación al analista)
export const getPagadasRecientes = (codTienda) =>
  http.get('/facturas/pagadas-recientes', { params: { codTienda } }).then((r) => r.data);

// Marca una factura PAGADA como vista por el analista (desaparece del badge/notif)
export const marcarVisto = (payload) => http.post('/facturas/marcar-visto', payload).then((r) => r.data);

export const MONEDA = { 1: 'Bs.S', 2: 'USD', 3: 'EUR', 4: 'Bs.D', 5: 'EUR' };
