const { sql, getPool, getGeneralPool } = require('../config/db');
const { resolverTienda, tiendasExtra } = require('./marca');
const { columnasLibres, expr } = require('./facturasCompra.service');
const { rolesDe } = require('../middleware/auth.middleware');

// Permisos por tipo de gasto: a un usuario se le pueden asignar tipos de gasto (campo libre
// TIPOGASTOS de ICG) y entonces solo ve los gastos de esos tipos en las bandejas, Archivo y
// Reportes. Sin ninguno asignado = ve todos (igual que las zonas). ADMIN ve todo.
// Se leen de la BD en cada petición (cacheado 1 minuto por usuario): un cambio en Admin
// aplica sin volver a iniciar sesión.

const SIN = 'SIN ESPECIFICAR';
// Clave para comparar: mayúsculas y sin espacios de más ("Inversion" = "INVERSION ").
const normal = (t) => (String(t == null ? '' : t).trim().replace(/\s+/g, ' ').toUpperCase() || SIN);

// ── Catálogo: los tipos de gasto que existen en ICG (todas las marcas, últimos 2 años) ──
let cacheCatalogo = null;
async function catalogo() {
  if (cacheCatalogo && Date.now() - cacheCatalogo.ts < 60 * 60 * 1000) return cacheCatalogo.lista;
  // Una tienda por marca para llegar a cada BD (principal + fuentes GENERAL extra).
  const gen = await getGeneralPool();
  const r = await gen.request().query(`
    SELECT MIN(CODIGO) AS cod FROM EMPRESASCONTABLES
    WHERE ISNULL(LTRIM(RTRIM(DIRECCION)), '') <> '' GROUP BY LTRIM(RTRIM(DIRECCION))`);
  const cods = r.recordset.map((x) => x.cod);
  const vistosMarca = new Set();
  for (const t of await tiendasExtra()) if (!vistosMarca.has(t.Marca)) { vistosMarca.add(t.Marca); cods.push(t.CodTienda); }

  const conteo = new Map(); // clave → { nombres: Map(nombre → n), n }
  const bds = new Set();
  for (const cod of cods) {
    let info;
    try { info = await resolverTienda(cod); } catch { continue; }
    if (info.error) continue;
    const bk = `${info.host}|${info.dbName}`;
    if (bds.has(bk)) continue;
    bds.add(bk);
    try {
      const cols = await columnasLibres(info.pool, bk);
      if (!cols.has('TIPOGASTOS')) continue;
      const q = await info.pool.request().query(`
        SELECT LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')})) AS Tipo, COUNT(*) AS n
        FROM FACTURASCOMPRA f
          JOIN FACTURASCOMPRACAMPOSLIBRES cl ON cl.NUMSERIE = f.NUMSERIE AND cl.NUMFACTURA = f.NUMFACTURA AND cl.N = f.N
        WHERE f.TIPODOC IN (12, 20) AND f.FECHA >= DATEADD(year, -2, GETDATE())
        GROUP BY LTRIM(RTRIM(${expr(cols, 'TIPOGASTOS')}))`);
      for (const x of q.recordset) {
        if (!x.Tipo) continue;
        const k = normal(x.Tipo);
        if (!conteo.has(k)) conteo.set(k, { nombres: new Map(), n: 0 });
        const c = conteo.get(k);
        c.n += x.n;
        c.nombres.set(x.Tipo, (c.nombres.get(x.Tipo) || 0) + x.n);
      }
    } catch { /* marca sin acceso: se omite */ }
  }
  // Nombre a mostrar: la forma más usada de cada tipo.
  const lista = [...conteo.entries()].map(([clave, c]) => ({
    clave, nombre: [...c.nombres.entries()].sort((a, b) => b[1] - a[1])[0][0], facturas: c.n,
  }));
  lista.push({ clave: SIN, nombre: 'Sin especificar', facturas: null });
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  cacheCatalogo = { lista, ts: Date.now() };
  return lista;
}

// ── Permisos del usuario ──
const cachePermisos = new Map(); // idUsuario → { set, ts }
async function permitidosDe(user) {
  if (!user || rolesDe(user).includes('ADMIN')) return null;
  const id = Number(user.idUsuario);
  const c = cachePermisos.get(id);
  if (c && Date.now() - c.ts < 60 * 1000) return c.set;
  const app = await getPool();
  const r = await app.request().input('id', sql.Int, id).query('SELECT TipoGasto FROM dbo.GD_UsuarioTipoGasto WHERE IdUsuario = @id');
  const set = r.recordset.length ? new Set(r.recordset.map((x) => normal(x.TipoGasto))) : null;
  cachePermisos.set(id, { set, ts: Date.now() });
  return set;
}
// Función para filtrar: (tipoGasto) → puede verlo. Sin restricción, siempre true.
async function filtroDe(user) {
  const set = await permitidosDe(user);
  return (tipo) => !set || set.has(normal(tipo));
}

async function tiposDeUsuarios() {
  const app = await getPool();
  const r = await app.request().query(`
    SELECT g.CodUsuarioIcg, t.TipoGasto FROM dbo.GD_UsuarioTipoGasto t JOIN dbo.GD_Usuario g ON g.IdUsuario = t.IdUsuario`);
  const m = new Map();
  for (const x of r.recordset) {
    if (!m.has(x.CodUsuarioIcg)) m.set(x.CodUsuarioIcg, []);
    m.get(x.CodUsuarioIcg).push(normal(x.TipoGasto));
  }
  return m;
}

async function asignar(codUsuarioIcg, tipos) {
  const app = await getPool();
  const u = await app.request().input('cod', sql.Int, codUsuarioIcg)
    .query('SELECT IdUsuario FROM dbo.GD_Usuario WHERE CodUsuarioIcg = @cod');
  if (!u.recordset.length) return { error: 'Asigna primero un rol al usuario.' };
  const id = u.recordset[0].IdUsuario;
  const lista = [...new Set(tipos.map(normal))];
  const tx = new sql.Transaction(app);
  await tx.begin();
  try {
    await new sql.Request(tx).input('id', sql.Int, id).query('DELETE FROM dbo.GD_UsuarioTipoGasto WHERE IdUsuario = @id');
    for (const t of lista) {
      await new sql.Request(tx).input('id', sql.Int, id).input('t', sql.NVarChar(100), t.slice(0, 100))
        .query('INSERT INTO dbo.GD_UsuarioTipoGasto (IdUsuario, TipoGasto) VALUES (@id, @t)');
    }
    await tx.commit();
  } catch (e) { await tx.rollback().catch(() => {}); throw e; }
  cachePermisos.delete(id);
  return { ok: true, tiposGasto: lista };
}

module.exports = { catalogo, permitidosDe, filtroDe, tiposDeUsuarios, asignar, normal };
