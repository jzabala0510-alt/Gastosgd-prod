const { sql, getGeneralPool } = require('../config/db');

// La jerarquía Zona -> Tienda sale de GENERAL.EMPRESASCONTABLES:
//   PROVINCIA = Zona, DESCRIPCION = Tienda, DIRECCION = Marca, POBLACION = Empresa, CODIGO = id de tienda.

async function zonas() {
  const gen = await getGeneralPool();
  const r = await gen.request().query(`
    SELECT LTRIM(RTRIM(PROVINCIA)) AS Zona, COUNT(DISTINCT CODIGO) AS Tiendas
    FROM EMPRESASCONTABLES
    WHERE PROVINCIA IS NOT NULL AND LTRIM(RTRIM(PROVINCIA)) <> ''
      AND LTRIM(RTRIM(PROVINCIA)) <> 'MARAGARITA'
    GROUP BY LTRIM(RTRIM(PROVINCIA))
    ORDER BY Zona`);
  return r.recordset;
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
  return r.recordset;
}

async function marcasDeZona({ zona }) {
  const gen = await getGeneralPool();
  const rq = gen.request();

  let where = "PROVINCIA IS NOT NULL AND LTRIM(RTRIM(PROVINCIA)) <> '' AND LTRIM(RTRIM(PROVINCIA)) <> 'MARAGARITA' AND DIRECCION IS NOT NULL AND LTRIM(RTRIM(DIRECCION)) <> ''";
  if (zona) { where += ' AND LTRIM(RTRIM(PROVINCIA)) = @zona'; rq.input('zona', sql.NVarChar, zona); }
  const r = await rq.query(`SELECT DISTINCT LTRIM(RTRIM(DIRECCION)) AS Marca FROM EMPRESASCONTABLES WHERE ${where} ORDER BY Marca`);
  return r.recordset.map((x) => x.Marca);
}

module.exports = { zonas, tiendas, marcasDeZona };
