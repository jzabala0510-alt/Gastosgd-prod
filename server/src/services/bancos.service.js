// Catálogo de bancos (GD_Banco), usado para el desglose de saldos por tienda.
// Compartido por catalogos.routes.js (solo activos, para el uploader de Saldos)
// y admin.routes.js (CRUD completo, panel de administración).
const { sql, getPool } = require('../config/db');

// Bancos activos, para cargar saldos por banco.
async function listarActivos() {
  const pool = await getPool();
  const r = await pool.request().query(
    'SELECT IdBanco, Nombre FROM dbo.GD_Banco WHERE Activo = 1 ORDER BY Orden, Nombre');
  return r.recordset;
}

// Todos los bancos (incl. inactivos), para el panel de administración.
async function listarTodos() {
  const pool = await getPool();
  const r = await pool.request().query(
    'SELECT IdBanco, Nombre, Orden, Activo FROM dbo.GD_Banco ORDER BY Orden, Nombre');
  return r.recordset;
}

async function crear(nombre) {
  const pool = await getPool();
  const max = await pool.request().query('SELECT ISNULL(MAX(Orden), 0) AS m FROM dbo.GD_Banco');
  const orden = (max.recordset[0].m || 0) + 1;
  const r = await pool.request().input('n', sql.NVarChar, nombre).input('o', sql.Int, orden)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.GD_Banco WHERE Nombre = @n)
        THROW 50001, 'Ya existe un banco con ese nombre', 1;
      INSERT INTO dbo.GD_Banco (Nombre, Orden) OUTPUT INSERTED.IdBanco VALUES (@n, @o);`);
  return { idBanco: r.recordset[0].IdBanco, nombre, orden };
}

async function actualizar(id, { nombre, activo }) {
  const pool = await getPool();
  if (nombre != null) {
    await pool.request().input('id', sql.Int, id).input('n', sql.NVarChar, nombre)
      .query('UPDATE dbo.GD_Banco SET Nombre = @n WHERE IdBanco = @id');
  }
  if (activo != null) {
    await pool.request().input('id', sql.Int, id).input('a', sql.Bit, !!activo)
      .query('UPDATE dbo.GD_Banco SET Activo = @a WHERE IdBanco = @id');
  }
}

module.exports = { listarActivos, listarTodos, crear, actualizar };
