// Utilidades de fecha ancladas a la zona horaria de Venezuela (America/Caracas,
// UTC-4). Se usa Intl con timeZone explícito para NO depender de la zona horaria
// del proceso Node ni del servidor: el "hoy" del negocio siempre es el de Venezuela.
//
// Motivo: new Date().toISOString().slice(0,10) da la fecha en UTC, y entre las
// 20:00 y medianoche (hora Venezuela) eso ya es el día siguiente — corría el día
// por defecto de cobertura/saldos/reportes.

const TZ = 'America/Caracas';

// Fecha de hoy en Venezuela como 'YYYY-MM-DD'.
function hoyVE() {
  // en-CA formatea como YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

module.exports = { hoyVE, TZ };
