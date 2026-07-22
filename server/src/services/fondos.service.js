const { sql, getPool } = require('../config/db');

// Tiendas de la zona + saldo cargado en esa fecha (agrupado por tienda + banco).
async function zonaConSaldos({ zona, fecha }) {
  const pool = await getPool();
  const rq = pool.request().input('f', sql.Date, fecha).input('z', sql.NVarChar, zona);
  const whereZona = `LTRIM(RTRIM(ec.PROVINCIA)) = @z`;
  const r = await rq.query(`
      SELECT t.codTienda, t.tienda, t.marca, d.IdBanco, d.MontoDisponible AS monto
      FROM (
        SELECT DISTINCT ec.CODIGO AS codTienda,
               LTRIM(RTRIM(ec.DESCRIPCION)) AS tienda,
               LTRIM(RTRIM(ec.DIRECCION))   AS marca
        FROM GENERAL.dbo.EMPRESASCONTABLES ec
        WHERE ${whereZona}
      ) t
      OUTER APPLY (
        SELECT IdBanco, MontoDisponible FROM dbo.GD_DispTienda
        WHERE CodTienda = t.codTienda AND Fecha = @f
      ) d
      ORDER BY t.tienda`);

  // Agrupa filas planas (una por tienda+banco) en { codTienda, tienda, marca, bancos: { idBanco: monto } }
  const porTienda = new Map();
  for (const row of r.recordset) {
    if (!porTienda.has(row.codTienda)) {
      porTienda.set(row.codTienda, { codTienda: row.codTienda, tienda: row.tienda, marca: row.marca, bancos: {} });
    }
    if (row.IdBanco != null) porTienda.get(row.codTienda).bancos[row.IdBanco] = Number(row.monto);
  }
  return [...porTienda.values()];
}

// Guarda el saldo por tienda y banco. items: [{codTienda, idBanco, monto}].
// Devuelve cuántas filas se guardaron (las inválidas se descartan en silencio, igual que antes).
async function guardarBulk({ fecha, items, idUsuario }) {
  const pool = await getPool();
  let n = 0;
  for (const it of items) {
    const cod = Number(it.codTienda);
    const idBanco = Number(it.idBanco);
    const monto = Number(it.monto);
    if (!Number.isInteger(cod) || cod < 0 || !Number.isInteger(idBanco) || idBanco < 1 || !Number.isFinite(monto)) continue;
    await pool.request()
      .input('c', sql.Int, cod).input('f', sql.Date, fecha).input('m', sql.Int, 1).input('b', sql.Int, idBanco)
      .input('monto', sql.Decimal(18, 2), monto).input('u', sql.Int, idUsuario)
      .query(`MERGE dbo.GD_DispTienda AS t
        USING (SELECT @c AS CodTienda, @f AS Fecha, @m AS CodMoneda, @b AS IdBanco) AS s
          ON t.CodTienda=s.CodTienda AND t.Fecha=s.Fecha AND t.CodMoneda=s.CodMoneda AND t.IdBanco=s.IdBanco
        WHEN MATCHED THEN UPDATE SET MontoDisponible=@monto, IdUsuario=@u, FechaRegistro=GETDATE()
        WHEN NOT MATCHED THEN INSERT (CodTienda,Fecha,CodMoneda,IdBanco,MontoDisponible,IdUsuario) VALUES (@c,@f,@m,@b,@monto,@u);`);
    n++;
  }
  return n;
}

module.exports = { zonaConSaldos, guardarBulk };
