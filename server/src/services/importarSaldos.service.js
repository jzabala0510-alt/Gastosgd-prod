const { sql, getPool, getGeneralPool } = require('../config/db');
const { normalize } = require('./tiendaMatcher');

// Solo lectura: resuelve alias, mapea bancos y devuelve el preview enriquecido para que el
// usuario confirme antes de escribir. La escritura real va por POST /api/fondos/bulk.
async function previewImportacion({ fecha, totalExcel, filas }) {
  const pool = await getPool();
  const gen = await getGeneralPool();

  // 1. Alias de tienda: NormRS → CodTienda
  const aliasRows = (await pool.request().query(
    "SELECT NormRS1, NormRS2, CodTienda FROM dbo.GD_TiendaAlias WHERE Estado='CONFIRMADO'"
  )).recordset;
  const aliasPorNorm = new Map();
  for (const a of aliasRows) {
    if (a.NormRS1) aliasPorNorm.set(a.NormRS1, a.CodTienda);
    if (a.NormRS2) aliasPorNorm.set(a.NormRS2, a.CodTienda);
  }

  // 2. Alias de banco: ColumnaNorm → { IdBanco, Nombre }
  const bancoAliasRows = (await pool.request().query(`
    SELECT ba.ColumnaNorm, ba.IdBanco, b.Nombre
    FROM dbo.GD_BancoAlias ba JOIN dbo.GD_Banco b ON b.IdBanco = ba.IdBanco`
  )).recordset;
  const bancoPorNorm = new Map(bancoAliasRows.map((b) => [b.ColumnaNorm, { idBanco: b.IdBanco, nombre: b.Nombre }]));

  // 3. Nombre ERP para mostrar en el preview (solo DESCRIPCION, sin cruzar más campos)
  const erpRows = (await gen.request().query(
    "SELECT CODIGO, LTRIM(RTRIM(DESCRIPCION)) AS Nombre FROM EMPRESASCONTABLES"
  )).recordset;
  const erpPorCod = new Map(erpRows.map((e) => [e.CODIGO, e.Nombre]));

  // 4. Registros Bs ya existentes para esa fecha (para marcar cuáles sobreescribirá)
  const existentes = (await pool.request().input('f', sql.Date, fecha).query(
    'SELECT CodTienda, IdBanco FROM dbo.GD_DispTienda WHERE Fecha = @f AND CodMoneda = 1'
  )).recordset;
  const existenteSet = new Set(existentes.map((e) => `${e.CodTienda}_${e.IdBanco}`));

  // 5. Procesar filas
  const items = [];
  const noResueltas = [];

  for (const f of filas) {
    const n1 = f.rs1 ? normalize(f.rs1) : null;
    const n2 = f.rs2 ? normalize(f.rs2) : null;
    const codTienda = (n1 && aliasPorNorm.get(n1)) || (n2 && aliasPorNorm.get(n2)) || null;

    if (!codTienda) {
      noResueltas.push({ fila: f.fila, rs1: f.rs1, rs2: f.rs2 });
      continue;
    }

    // Acumular por IdBanco (sub-cuentas del mismo banco se suman)
    const montosPorBanco = {};
    for (const [header, monto] of Object.entries(f.bancos || {})) {
      const colNorm = normalize(header);
      const bancoInfo = bancoPorNorm.get(colNorm);
      if (!bancoInfo) continue;
      const v = Number(monto);
      if (!Number.isFinite(v) || v === 0) continue;
      montosPorBanco[bancoInfo.idBanco] = (montosPorBanco[bancoInfo.idBanco] || 0) + v;
    }

    for (const [idBancoStr, monto] of Object.entries(montosPorBanco)) {
      const idBanco = Number(idBancoStr);
      const bancoDef = bancoAliasRows.find((b) => b.IdBanco === idBanco);
      items.push({
        fila: f.fila,
        codTienda,
        tiendaErp: erpPorCod.get(codTienda) || `(${codTienda})`,
        idBanco,
        banco: bancoDef?.Nombre || String(idBanco),
        monto: Math.round(monto * 100) / 100,
        sobreescribe: existenteSet.has(`${codTienda}_${idBanco}`),
      });
    }
  }

  const totalImportar = items.reduce((a, b) => a + b.monto, 0);
  const sobreescribe = items.some((i) => i.sobreescribe);

  return { fecha, items, noResueltas, totalImportar, totalExcel: totalExcel || null, sobreescribe };
}

module.exports = { previewImportacion };
