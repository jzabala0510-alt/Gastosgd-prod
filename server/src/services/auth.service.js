const { sql, getPool, getGeneralPool } = require('../config/db');

// Usuarios ICG (activos, no bloqueados) cuya contraseña cifrada coincide.
async function buscarPorClave(passEnc) {
  const gPool = await getGeneralPool();
  const r = await gPool.request()
    .input('pass', sql.NVarChar, passEnc)
    .query(`
      SELECT CODUSUARIO, LTRIM(RTRIM(USUARIO)) AS USUARIO
      FROM USUARIOS
      WHERE NEWPASS = @pass
        AND ISNULL(BLOQUEADO, 'F') = 'F'
        AND ISNULL(DESCATALOGADO, 'F') = 'F'`);
  return r.recordset;
}

// Todos los usuarios con rol activo en GastosGD.
async function usuariosGastosGDActivos() {
  const aPool = await getPool();
  const r = await aPool.request()
    .query('SELECT IdUsuario, CodUsuarioIcg, Rol, Nombre FROM dbo.GD_Usuario WHERE Activo = 1');
  return r.recordset;
}

// Ámbito del usuario. Sin filas = sin restricción.
//   CodAlmacen → tiendas (compat)   ·   Zona → alcance por zona
async function ambitoDeUsuario(idUsuario) {
  const aPool = await getPool();
  const r = await aPool.request()
    .input('id', sql.Int, idUsuario)
    .query('SELECT CodAlmacen, Zona FROM dbo.GD_UsuarioAmbito WHERE IdUsuario = @id');
  return r.recordset;
}

module.exports = { buscarPorClave, usuariosGastosGDActivos, ambitoDeUsuario };
