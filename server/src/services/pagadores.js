const { tiendaInfo } = require('./marca');

// "Se paga por": la empresa que va a pagar el gasto. La elige el Analista al meter el gasto al
// flujo: la propia tienda o una de las mayores. Se guarda en GD_FacturaFlujo.PagadoPor como
// codTienda (de GastosGD) de esa empresa.
// Las mayores salen de EMPRESAS_PAGADORAS en el .env (códigos separados por coma). Sin la
// variable: 24 Top Group, 221 Supreme Group, 217 Sport Group VIP.

const mayores = () => String(process.env.EMPRESAS_PAGADORAS || '24,221,217')
  .split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);

// Nombre de una empresa (EMPRESASCONTABLES.DESCRIPCION), cacheado 1 hora.
const nombres = new Map();
async function nombreEmpresa(cod) {
  const c = nombres.get(cod);
  if (c && Date.now() - c.ts < 60 * 60 * 1000) return c.nombre;
  let nombre = null;
  try { const t = await tiendaInfo(cod); nombre = t ? t.Tienda : null; } catch { /* sin GENERAL: sin nombre */ }
  nombres.set(cod, { nombre, ts: Date.now() });
  return nombre;
}

// Opciones para un gasto de esa tienda: primero la propia tienda, después las mayores.
async function opciones(codTienda) {
  const cod = Number(codTienda);
  const out = [{ codTienda: cod, nombre: (await nombreEmpresa(cod)) || `Tienda ${cod}`, esTienda: true }];
  for (const m of mayores().filter((x) => x !== cod)) {
    out.push({ codTienda: m, nombre: (await nombreEmpresa(m)) || `Empresa ${m}`, esTienda: false });
  }
  return out;
}

async function esValido(codTienda, pagadoPor) {
  const p = Number(pagadoPor);
  return p === Number(codTienda) || mayores().includes(p);
}

// Lo que se muestra: { codTienda, nombre, esTienda } o null si no se ha elegido.
async function etiqueta(codTienda, pagadoPor) {
  if (pagadoPor == null) return null;
  const p = Number(pagadoPor);
  return { codTienda: p, nombre: (await nombreEmpresa(p)) || `Empresa ${p}`, esTienda: p === Number(codTienda) };
}

// Para listas: precarga los nombres de todas las empresas que aparecen (una consulta por
// empresa) y devuelve una función síncrona (codTienda, pagadoPor) → etiqueta.
async function etiquetador(pagadoPorLista) {
  for (const p of new Set(pagadoPorLista.filter((x) => x != null).map(Number))) await nombreEmpresa(p);
  return (codTienda, pagadoPor) => {
    if (pagadoPor == null) return null;
    const p = Number(pagadoPor);
    const c = nombres.get(p);
    return { codTienda: p, nombre: (c && c.nombre) || `Empresa ${p}`, esTienda: p === Number(codTienda) };
  };
}

module.exports = { mayores, opciones, esValido, etiqueta, etiquetador, nombreEmpresa };
