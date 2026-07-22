const { sql, getGeneralPool } = require('../config/db');

// Alcance por zona: un usuario puede quedar limitado a una o varias zonas
// (EMPRESASCONTABLES.PROVINCIA). Sin zonas asignadas = ve todo (irrestricto).
// ADMIN siempre es irrestricto (es el supervisor).

// Zonas permitidas del usuario, o null si no hay restricción.
function zonasDe(user) {
  if (!user) return null;
  const roles = Array.isArray(user.roles) ? user.roles : (user.rol ? [user.rol] : []);
  if (roles.includes('ADMIN')) return null;
  const zonas = Array.isArray(user.zonas) ? user.zonas.filter(Boolean) : [];
  return zonas.length ? zonas : null;
}

// Cache zona→CodTiendas (EMPRESASCONTABLES cambia rara vez). TTL 5 min.
const cache = new Map();
const TTL_MS = 5 * 60 * 1000;

async function codTiendasDeZonas(zonas) {
  const key = [...zonas].sort().join('|');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.set;

  const gen = await getGeneralPool();
  const rq = gen.request();
  const conds = [];
  zonas.forEach((z, i) => {
    rq.input(`z${i}`, sql.NVarChar, z);
    conds.push(`LTRIM(RTRIM(PROVINCIA)) = @z${i}`);
  });
  const r = await rq.query(`SELECT DISTINCT CODIGO FROM EMPRESASCONTABLES WHERE ${conds.join(' OR ')}`);
  const set = new Set(r.recordset.map((x) => x.CODIGO));
  cache.set(key, { set, ts: Date.now() });
  return set;
}

// Resuelve el alcance del usuario de la petición:
//   { irrestricto: true }  o  { irrestricto: false, zonas: Set, codTiendas: Set }
async function alcanceDe(user) {
  const zonas = zonasDe(user);
  if (!zonas) return { irrestricto: true };
  const codTiendas = await codTiendasDeZonas(zonas);
  return { irrestricto: false, zonas: new Set(zonas), codTiendas };
}

// True si el usuario NO puede ver esa tienda (para bloquear en endpoints por codTienda).
async function bloqueadoPorAlcance(user, codTienda) {
  const a = await alcanceDe(user);
  if (a.irrestricto) return false;
  return !a.codTiendas.has(Number(codTienda));
}

module.exports = { alcanceDe, zonasDe, bloqueadoPorAlcance };
