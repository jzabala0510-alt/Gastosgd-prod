const { sql, getPool } = require('../config/db');

// Todos los usuarios ICG (no bloqueados) + sus roles y zonas en GastosGD.
async function listarUsuarios() {
  const pool = await getPool();
  const r = await pool.request().query(`
    SELECT u.CODUSUARIO            AS codUsuarioIcg,
           LTRIM(RTRIM(u.USUARIO)) AS usuario,
           g.Rol                   AS rol,
           CAST(ISNULL(g.Activo, 0) AS BIT) AS activo
    FROM GENERAL.dbo.USUARIOS u
    LEFT JOIN dbo.GD_Usuario g ON g.CodUsuarioIcg = u.CODUSUARIO
    WHERE ISNULL(u.BLOQUEADO,'F') <> 'T' AND ISNULL(u.DESCATALOGADO,'F') <> 'T'
    ORDER BY CASE WHEN g.Rol IS NOT NULL AND g.Activo = 1 THEN 0 ELSE 1 END, u.USUARIO`);
  // Zonas asignadas por usuario (ámbito). Sin filas = ve todas las zonas.
  const az = await pool.request().query(`
    SELECT g.CodUsuarioIcg, LTRIM(RTRIM(a.Zona)) AS Zona
    FROM dbo.GD_UsuarioAmbito a JOIN dbo.GD_Usuario g ON g.IdUsuario = a.IdUsuario
    WHERE a.Zona IS NOT NULL AND LTRIM(RTRIM(a.Zona)) <> ''`);
  const zonasPorCod = new Map();
  for (const z of az.recordset) {
    if (!zonasPorCod.has(z.CodUsuarioIcg)) zonasPorCod.set(z.CodUsuarioIcg, []);
    zonasPorCod.get(z.CodUsuarioIcg).push(z.Zona);
  }

  // roles = [] cuando el usuario está inactivo o sin asignar (sin acceso efectivo)
  return r.recordset.map((u) => ({
    codUsuarioIcg: u.codUsuarioIcg,
    usuario: u.usuario,
    activo: u.activo,
    roles: (u.activo && u.rol) ? String(u.rol).split(',').map((s) => s.trim()).filter(Boolean) : [],
    zonas: zonasPorCod.get(u.codUsuarioIcg) || [],
  }));
}

// Asigna roles (Activo=1) o revoca (sin roles → Activo=0).
async function asignarRoles(cod, roles) {
  const pool = await getPool();

  if (!roles.length) {
    await pool.request().input('cod', sql.Int, cod)
      .query('UPDATE dbo.GD_Usuario SET Activo = 0 WHERE CodUsuarioIcg = @cod');
    return { activo: false };
  }

  const rolCsv = roles.join(',');
  await pool.request()
    .input('cod', sql.Int, cod).input('rol', sql.NVarChar, rolCsv)
    .query(`
      MERGE dbo.GD_Usuario AS t
      USING (SELECT @cod AS Cod,
               (SELECT LTRIM(RTRIM(USUARIO)) FROM GENERAL.dbo.USUARIOS WHERE CODUSUARIO = @cod) AS Usr) AS s
      ON t.CodUsuarioIcg = s.Cod
      WHEN MATCHED THEN UPDATE SET Rol = @rol, Activo = 1
      WHEN NOT MATCHED THEN INSERT (CodUsuarioIcg, Usuario, Nombre, Rol, Activo)
        VALUES (s.Cod, s.Usr, s.Usr, @rol, 1);`);
  return { activo: true };
}

// Define el alcance por zona del usuario. zonas=[] → ve todas las zonas.
// Devuelve {ok:true} o {error: mensaje} si el usuario no tiene rol asignado aún.
async function asignarZonas(cod, zonas) {
  const pool = await getPool();
  const u = await pool.request().input('cod', sql.Int, cod)
    .query('SELECT IdUsuario FROM dbo.GD_Usuario WHERE CodUsuarioIcg = @cod');
  if (!u.recordset.length) return { error: 'Asigna primero un rol al usuario.' };
  const idUsuario = u.recordset[0].IdUsuario;

  // Reemplaza las filas de zona (conserva CodAlmacen/CodMarca si existieran).
  await pool.request().input('id', sql.Int, idUsuario)
    .query('DELETE FROM dbo.GD_UsuarioAmbito WHERE IdUsuario = @id AND Zona IS NOT NULL');
  for (const z of zonas) {
    await pool.request().input('id', sql.Int, idUsuario).input('z', sql.NVarChar, z)
      .query('INSERT INTO dbo.GD_UsuarioAmbito (IdUsuario, Zona) VALUES (@id, @z)');
  }
  return { ok: true };
}

module.exports = { listarUsuarios, asignarRoles, asignarZonas };
