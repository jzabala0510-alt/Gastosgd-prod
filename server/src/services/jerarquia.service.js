const { sql, getGeneralPool } = require('../config/db');
const { tiendasExtra } = require('./marca');

// La jerarquía Zona -> Tienda sale de GENERAL.EMPRESASCONTABLES:
//   PROVINCIA = Zona, DESCRIPCION = Tienda, DIRECCION = Marca, POBLACION = Empresa, CODIGO = id de tienda.
// Se une con las tiendas de fuentes GENERAL extra (marca.js::tiendasExtra(),
// ya con su offset aplicado) por nombre de Zona/Marca -- sin duplicar filas.

const zonaValida = (p) => !!(p && p.trim() && p.trim().toUpperCase() !== 'MARAGARITA');

async function zonas() {
  const gen = await getGeneralPool();
  const r = await gen.request().query(`
    SELECT LTRIM(RTRIM(PROVINCIA)) AS Zona, COUNT(DISTINCT CODIGO) AS Tiendas
    FROM EMPRESASCONTABLES
    WHERE PROVINCIA IS NOT NULL AND LTRIM(RTRIM(PROVINCIA)) <> ''
      AND LTRIM(RTRIM(PROVINCIA)) <> 'MARAGARITA'
    GROUP BY LTRIM(RTRIM(PROVINCIA))
    ORDER BY Zona`);

  const conteoExtra = new Map();
  for (const t of await tiendasExtra()) {
    if (zonaValida(t.Zona)) conteoExtra.set(t.Zona, (conteoExtra.get(t.Zona) || 0) + 1);
  }
  if (!conteoExtra.size) return r.recordset;

  const porZona = new Map(r.recordset.map((z) => [z.Zona, { ...z }]));
  for (const [zona, n] of conteoExtra) {
    if (porZona.has(zona)) porZona.get(zona).Tiendas += n;
    else porZona.set(zona, { Zona: zona, Tiendas: n });
  }
  return [...porZona.values()].sort((a, b) => a.Zona.localeCompare(b.Zona));
}

async function tiendas({ zona, marca }) {
  const gen = await getGeneralPool();
  const rq = gen.request();

  let where = "PROVINCIA IS NOT NULL AND LTRIM(RTRIM(PROVINCIA)) <> ''";
  if (zona) { where += ' AND LTRIM(RTRIM(PROVINCIA)) = @zona'; rq.input('zona', sql.NVarChar, zona); }
  if (marca) { where += ' AND LTRIM(RTRIM(DIRECCION)) = @marca'; rq.input('marca', sql.NVarChar, marca); }
  const r = await rq.query(`
    SELECT DISTINCT CODIGO AS CodTienda,
      LTRIM(RTRIM(DESCRIPCION)) AS Tienda, LTRIM(RTRIM(DIRECCION)) AS Marca,
      LTRIM(RTRIM(POBLACION)) AS Empresa, LTRIM(RTRIM(PROVINCIA)) AS Zona
    FROM EMPRESASCONTABLES
    WHERE ${where}
    ORDER BY Tienda`);

  const extra = (await tiendasExtra()).filter((t) =>
    zonaValida(t.Zona) && (!zona || t.Zona === zona) && (!marca || t.Marca === marca));
  if (!extra.length) return r.recordset;
  return [...r.recordset, ...extra].sort((a, b) => String(a.Tienda).localeCompare(String(b.Tienda)));
}

async function marcasDeZona({ zona }) {
  const gen = await getGeneralPool();
  const rq = gen.request();

  let where = "PROVINCIA IS NOT NULL AND LTRIM(RTRIM(PROVINCIA)) <> '' AND LTRIM(RTRIM(PROVINCIA)) <> 'MARAGARITA' AND DIRECCION IS NOT NULL AND LTRIM(RTRIM(DIRECCION)) <> ''";
  if (zona) { where += ' AND LTRIM(RTRIM(PROVINCIA)) = @zona'; rq.input('zona', sql.NVarChar, zona); }
  const r = await rq.query(`SELECT DISTINCT LTRIM(RTRIM(DIRECCION)) AS Marca FROM EMPRESASCONTABLES WHERE ${where} ORDER BY Marca`);

  const set = new Set(r.recordset.map((x) => x.Marca));
  for (const t of await tiendasExtra()) {
    if (zonaValida(t.Zona) && t.Marca && (!zona || t.Zona === zona)) set.add(t.Marca);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

module.exports = { zonas, tiendas, marcasDeZona };
