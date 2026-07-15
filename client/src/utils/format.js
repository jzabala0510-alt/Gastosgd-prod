export const money = (v) =>
  Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fecha = (v) => {
  if (!v) return '';
  const s = String(v);
  // Las fechas del ERP llegan como ISO a medianoche UTC (p. ej. 2026-05-27T00:00:00.000Z).
  // Tomamos la parte YYYY-MM-DD directamente para NO desplazar el día por zona horaria
  // (Venezuela es UTC-4; new Date(...).toLocaleDateString restaría un día).
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try { return new Date(v).toLocaleDateString('es-VE'); } catch { return s; }
};

export const fechaHora = (v) => {
  if (!v) return '';
  const s = String(v);
  // Los DATETIME de la app se guardan con GETDATE() (hora de Venezuela) y el driver
  // los serializa con 'Z'. Si hiciéramos new Date(...).toLocaleString, el navegador
  // volvería a restar 4h y la hora saldría corrida. Tomamos los componentes tal cual.
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}, ${m[4]}:${m[5]}`;
  try { return new Date(v).toLocaleString('es-VE'); } catch { return s; }
};

// Fecha de hoy en Venezuela (America/Caracas) como 'YYYY-MM-DD', para valores por
// defecto. new Date().toISOString() da UTC y de noche (después de las 8pm) devuelve
// el día siguiente; anclamos la zona horaria explícitamente.
export const hoyVE = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
