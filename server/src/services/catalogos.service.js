const { getPool } = require('../config/db');

async function tiendas(soloVenta) {
  const pool = await getPool();
  const r = await pool.request().query(
    `SELECT CodAlmacen, Tienda, Zona, Pais, CodPais, CodEmpresa, CodMarca, Marca, EsTiendaVenta
     FROM dbo.GD_vw_Tienda
     ${soloVenta ? 'WHERE EsTiendaVenta = 1' : ''}
     ORDER BY CodAlmacen`
  );
  return r.recordset;
}

async function zonas() {
  const pool = await getPool();
  const r = await pool.request().query(
    "SELECT DISTINCT Zona FROM dbo.GD_vw_Tienda WHERE Zona IS NOT NULL AND Zona <> '' ORDER BY Zona"
  );
  return r.recordset.map((x) => x.Zona);
}

async function marcas() {
  const pool = await getPool();
  const r = await pool.request().query(
    'SELECT DISTINCT CodMarca, Marca FROM dbo.GD_vw_Tienda ORDER BY CodMarca'
  );
  return r.recordset;
}

async function monedas() {
  const pool = await getPool();
  const r = await pool.request().query(
    'SELECT CodMoneda, Descripcion, Iniciales, Iso, EsPrincipal, Cotizacion FROM dbo.GD_vw_Moneda ORDER BY EsPrincipal DESC, CodMoneda'
  );
  return r.recordset;
}

async function categorias() {
  const pool = await getPool();
  const r = await pool.request().query(
    'SELECT IdCategoria, Nombre FROM dbo.GD_CategoriaGasto WHERE Activo = 1 ORDER BY Nombre'
  );
  return r.recordset;
}

module.exports = { tiendas, zonas, marcas, monedas, categorias };
